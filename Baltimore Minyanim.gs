const BJL_API = 'https://baltimorejewishlife.com/wp-json/minyan-times/v1';
const TIME_ZONE = 'America/New_York';
const ZIP_CODE = '21209';
const TEFILLOS = [
  { type: 'Shacharis', subject: 'Shachris' },
  { type: 'Mincha', subject: 'Mincha' },
  { type: 'Mincha/Maariv', subject: 'Mincha - Maariv' },
  { type: 'Maariv', subject: 'Maariv' }
];
const HOLIDAY_FLAGS = [
  'IsAsaraBiteves', 'IsCholHamoed', 'IsErevPesach', 'IsErevShabbos',
  'IsErevTishaBav', 'IsErevYomKipper', 'IsErevYomTov', 'IsFastDay',
  'IsRoshChodesh', 'IsShabbos', 'IsShivaAsarBitammuz', 'IsTaanisEsther',
  'IsTishaBav', 'IsTuBeshvat', 'IsTzomGedalia', 'IsYomKipper', 'IsYomTov',
  'IsBHB', 'IsSlichosBeforeRH', 'IsSlichosAfterRH', 'IsChanuka'
];

function main() {
  const date = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  const hebcal = fetchJson('https://www.hebcal.com/zmanim?' + queryString({
    cfg: 'json', zip: ZIP_CODE, date: date
  }));
  if (hebcal.date !== date || !hebcal.times || !hebcal.location) {
    throw new Error('Unexpected Hebcal response');
  }
  // Keep BJL's own holiday flags so special schedules match its website.
  // All astronomical times used below come from Hebcal, not this response.
  const calendar = fetchJson(BJL_API + '/zManim/gps?' + queryString({
    date: date, lat: hebcal.location.latitude, lng: hebcal.location.longitude
  }));
  if (calendar.ErrMsg || !calendar.Time ||
    String(calendar.Time.DateCivil).slice(0, 10) !== date) {
    throw new Error('Unexpected BJL calendar response');
  }
  // Fetch and validate every email before deleting the previous messages.
  const messages = TEFILLOS.map(function (tefilla) {
    return getTimes(tefilla.type, date, calendar.Time, hebcal.times);
  });
  removeOldEmails(); // Remove this line to keep previous emails.
  for (let i = TEFILLOS.length - 1; i >= 0; i--) {
    emailTimes(messages[i], TEFILLOS[i].subject);
    console.log('Sent ' + TEFILLOS[i].subject);
    Utilities.sleep(500);
  }
  Utilities.sleep(5000);
  markLabeledEmailsRead();
  console.log(`RemainingDailyQuota: ${MailApp.getRemainingDailyQuota()}`);
}

function queryString(params) {
  return Object.keys(params).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
}

function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = UrlFetchApp.fetch(url, {
        headers: { Accept: 'application/json' }, muteHttpExceptions: true
      });
    } catch (err) {
      if (attempt === 2) throw err;
      Utilities.sleep(1000 * Math.pow(2, attempt));
      continue;
    }
    const status = response.getResponseCode();
    if (status >= 200 && status < 300) {
      // Parse JSON properly; never extract data using string boundaries.
      return JSON.parse(response.getContentText());
    }
    if ((status !== 429 && status < 500) || attempt === 2) {
      throw new Error('HTTP ' + status + ' fetching ' + url);
    }
    Utilities.sleep(1000 * Math.pow(2, attempt));
  }
}

function getTimes(type, date, calendar, zmanim) {
  const params = {
    city: 'Baltimore', day: calendar.Weekday, date: date.replace(/-/g, '/'),
    type: type, sortBy: 'time'
  };
  HOLIDAY_FLAGS.forEach(function (flag) {
    if (typeof calendar[flag] !== 'boolean') {
      throw new Error('Missing BJL calendar flag: ' + flag);
    }
    params['holidays[' + flag + ']'] = calendar[flag];
  });
  const rows = fetchJson(BJL_API + '/times?' + queryString(params));
  if (!Array.isArray(rows)) throw new Error('Expected an array of minyan times');
  const entries = rows.map(function (row) {
    if (!row.location || row.type !== type) throw new Error('Invalid minyan row');
    const minutes = minyanMinutes(row, zmanim);
    const hour = Math.floor(minutes / 60);
    const time = (hour % 12 || 12) + ':' + String(minutes % 60).padStart(2, '0') +
      (hour < 12 ? ' am' : ' pm');
    return {
      minutes: minutes, location: row.location,
      text: time + ' - ' + row.location.trim().replace(/\s+/g, ' ')
    };
  });
  entries.sort(function (a, b) {
    return a.minutes - b.minutes || a.location.localeCompare(b.location);
  });
  return entries.length ? entries.map(function (entry) { return entry.text; }).join('\n') :
    'No minyanim listed for this date.';
}

function minyanMinutes(row, zmanim) {
  if (Number(row.isCustom) !== 1) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) {
      throw new Error('Invalid fixed time: ' + row.time);
    }
    const parts = row.time.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }
  const formula = Number(row.formula);
  const base = { 1: 'sunset', 2: 'sunset', 3: 'sunrise', 4: 'sunrise', 5: 'minchaGedola' }[formula];
  if (!base || !zmanim[base]) throw new Error('Unknown or unavailable time formula: ' + row.formula);
  const offset = Number(row.minutes);
  if (formula !== 5 && (row.minutes == null || !Number.isFinite(offset))) {
    throw new Error('Invalid relative time offset');
  }
  // BJL's formula 5 uses MinchaStrict, rather than astronomical noon.
  // Approximate that with the later of Hebcal minchaGedola and chatzot + 30m.
  let instant = new Date(zmanim[base]).getTime();
  if (formula === 5) {
    instant = Math.max(instant, new Date(zmanim.chatzot).getTime() + 30 * 60000);
  } else {
    instant += (formula === 1 || formula === 3 ? -offset : offset) * 60000;
  }
  if (!Number.isFinite(instant)) throw new Error('Invalid Hebcal time: ' + base);
  const parts = Utilities.formatDate(new Date(instant), TIME_ZONE, 'HH:mm').split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function removeOldEmails() {
  const label = GmailApp.getUserLabelByName('Zmanim');
  if (!label) return;
  const threads = label.getThreads();
  threads.forEach(function (thread) { thread.moveToTrash(); });
  console.log('Removed ' + threads.length + ' old emails');
}

function markLabeledEmailsRead() {
  const label = GmailApp.getUserLabelByName('Zmanim');
  if (!label) return;
  const batchSize = 100;
  let threads;
  let start = 0;
  do {
    threads = label.getThreads(start, batchSize);
    threads.forEach(function (thread) { thread.markRead(); });
    start += threads.length;
  } while (threads.length === batchSize);
}

function emailTimes(text, tefilla) {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Zmanim: ' + tefilla, text, {
    name: 'Baltimore Minyanim'
  });
}