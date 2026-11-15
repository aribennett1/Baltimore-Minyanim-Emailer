const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../Baltimore Minyanim.gs'), 'utf8');
function script(overrides = {}) {
  const context = vm.createContext({
    console,
    Utilities: {
      sleep() {},
      formatDate(date, zone, pattern) {
        assert.equal(zone, 'America/New_York');
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
          timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(date).map(p => [p.type, p.value]));
        return pattern === 'HH:mm' ? `${parts.hour}:${parts.minute}` :
          `${parts.year}-${parts.month}-${parts.day}`;
      }
    }, ...overrides
  });
  vm.runInContext(source, context);
  return context;
}
const zmanim = {
  sunrise: '2026-11-15T06:50:00-05:00', sunset: '2026-11-15T16:52:00-05:00',
  chatzot: '2026-11-15T11:51:00-05:00', minchaGedola: '2026-11-15T12:16:00-05:00'
};
test('fixed times and all five formulas use Baltimore local clock time', () => {
  const c = script();
  assert.equal(c.minyanMinutes({ time: '23:30', isCustom: '0' }, zmanim), 1410);
  [992, 1032, 390, 430, 741].forEach((expected, i) => {
    assert.equal(c.minyanMinutes({ isCustom: '1', formula: String(i + 1), minutes: '20' }, zmanim), expected);
  });
  assert.equal(c.minyanMinutes({ isCustom: '1', formula: '3', minutes: '0' }, {
    ...zmanim, sunrise: '2026-07-01T05:43:00-04:00'
  }), 343);
  assert.throws(() => c.minyanMinutes({ isCustom: '1', formula: '99' }, zmanim));
});
test('JSON fetch retries transient errors, rejects permanent errors and malformed JSON', () => {
  let calls = 0;
  const c = script({ UrlFetchApp: { fetch() {
    calls++;
    return { getResponseCode: () => calls < 3 ? 503 : 200, getContentText: () => '{"ok":true}' };
  } } });
  assert.equal(c.fetchJson('test').ok, true);
  assert.equal(calls, 3);
  c.UrlFetchApp.fetch = () => ({ getResponseCode: () => 403 });
  assert.throws(() => c.fetchJson('test'), /HTTP 403/);
  c.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => '<html>' });
  assert.throws(() => c.fetchJson('test'), /Unexpected token/);
});
test('main validates all four responses before cleanup and sends in reverse order', () => {
  const c = script();
  const events = [];
  const date = c.Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  const calendar = { DateCivil: date, Weekday: 'Sunday' };
  vm.runInContext('HOLIDAY_FLAGS', c).forEach(flag => { calendar[flag] = false; });
  c.fetchJson = url => {
    const u = new URL(url);
    if (u.hostname === 'www.hebcal.com') {
      assert.equal(u.searchParams.get('zip'), '21209');
      return { date, location: { latitude: 39.36, longitude: -76.67 }, times: zmanim };
    }
    if (u.pathname.endsWith('/gps')) return { Time: calendar };
    assert.equal(u.searchParams.get('day'), 'Sunday');
    assert.equal(u.searchParams.get('holidays[IsRoshChodesh]'), 'false');
    const type = u.searchParams.get('type');
    events.push('fetch ' + type);
    return [{ location: 'Test Shul', type, time: '07:00', isCustom: '0' }];
  };
  c.removeOldEmails = () => events.push('cleanup');
  c.emailTimes = (text, type) => {
    assert.equal(text, '7:00 am - Test Shul');
    events.push('send ' + type);
  };
  c.Utilities.sleep = ms => events.push('sleep ' + ms);
  c.markLabeledEmailsRead = () => events.push('mark read');
  c.main();
  assert.deepEqual(events, ['fetch Shacharis', 'fetch Mincha', 'fetch Mincha/Maariv', 'fetch Maariv',
    'cleanup', 'send Maariv', 'send Mincha - Maariv', 'send Mincha', 'send Shachris', 'sleep 10000', 'mark read']);
  events.length = 0;
  c.fetchJson = () => { throw new Error('upstream failure'); };
  assert.throws(() => c.main(), /upstream failure/);
  assert.deepEqual(events, []);
});

test('marks every labeled thread read across multiple batches', () => {
  let marked = 0;
  const starts = [];
  const c = script({ GmailApp: { getUserLabelByName(name) {
    assert.equal(name, 'Zmanim');
    return { getThreads(start, limit) {
      starts.push(start);
      assert.equal(limit, 100);
      return Array.from({ length: start === 0 ? 100 : 2 }, () => ({
        markRead() { marked++; }
      }));
    } };
  } } });
  c.markLabeledEmailsRead();
  assert.equal(marked, 102);
  assert.deepEqual(starts, [0, 100]);
  c.GmailApp.getUserLabelByName = () => null;
  c.markLabeledEmailsRead();
});
test('body contains only sorted times and locations, including relative times', () => {
  const c = script();
  const calendar = { Weekday: 'Sunday' };
  vm.runInContext('HOLIDAY_FLAGS', c).forEach(flag => { calendar[flag] = false; });
  c.fetchJson = () => [
    { location: '  Later   Shul  ', type: 'Mincha', time: '13:00', isCustom: '0', address: '123 Road', notes: 'note', bjlTag: 'tag' },
    { location: 'Earlier Shul', type: 'Mincha', isCustom: '1', formula: '5' }
  ];
  assert.equal(c.getTimes('Mincha', '2026-11-15', calendar, zmanim),
    '12:21 pm - Earlier Shul\n1:00 pm - Later Shul');
});
