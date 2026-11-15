# Baltimore-Minyanim-Emailer

Google Apps Script that sends four daily emails with Baltimore Jewish Life's minyan listings: Shachris, Mincha, Mincha–Maariv, and Maariv.

The updated BJL website uses a public JSON API. This script calls it directly with `UrlFetchApp` and parses responses with `JSON.parse`. No ScrapingAnt account, API key, cookies, or browser rendering is needed.

## Setup

1. Paste `Baltimore Minyanim.gs` into a Google Apps Script project using the V8 runtime.
2. Run `main` once and authorize URL fetching, email sending, and Gmail access.
3. Set the project's timezone to `America/New_York` and add a daily time trigger for `main` after midnight. The script also explicitly uses Baltimore's timezone when choosing the date and formatting times.
4. To remove yesterday's emails automatically, create a Gmail filter that applies the `Zmanim` label to these emails. Each run trashes threads with that label after all four new messages have been fetched and validated. After sending, it waits 10 seconds for the Gmail filter to apply the label, then iterates over all `Zmanim`-labeled threads and marks them as read. Remove `removeOldEmails();` to disable cleanup. A missing label is harmless.

Emails go to the account that runs the script. They are sent in reverse order so Shachris appears first in the inbox. This repository does not deploy or configure your Apps Script project automatically.

## Data sources and calculations

- Listings: `https://baltimorejewishlife.com/wp-json/minyan-times/v1/times`
- Relative times: [Hebcal Zmanim API](https://www.hebcal.com/home/1663/zmanim-halachic-times-api), with ZIP **21209**. Hebcal's API output is licensed CC BY 4.0; attribution is recorded here.
- Holiday flags: BJL's `/zManim/gps` endpoint, using the ZIP coordinates returned by Hebcal. Only its calendar metadata is used; astronomical times come from Hebcal. The flags are passed as `holidays[IsRoshChodesh]`, etc., exactly as BJL's JavaScript does.

BJL's JavaScript bundle builds requests under `/wp-json/minyan-times/v1`, calls `/times` with a **weekday name** (such as `Sunday`, not `0`), a `YYYY/MM/DD` date, city, prayer type, and holiday flags. The page also installs a `/wp-json/bjl-mt/v1/batch` optimization; individual endpoints work directly without that wrapper or its WordPress nonce.

Fixed times are preserved. Custom formulas 1–4 mean before/after sunset and before/after sunrise, offset by the row's `minutes`. Formula 5 is labeled “Midday” but BJL actually uses `MinchaStrict`. We approximate it with the later of Hebcal's `minchaGedola` and `chatzot` plus 30 clock minutes. Calculated times are approximate and may differ from BJL's MyZmanim calculations. Email bodies contain only times and locations, sorted by calculated clock time, with no headers, footers, addresses, notes, or links.

Network failures and HTTP 429/5xx responses get at most three attempts. Other HTTP errors, malformed JSON, and unexpected data stop the run before cleanup or sending. Email delivery itself is not transactional: a sending error can still leave a partially sent set.

## Direct curl examples

Fetch the ZIP-specific astronomical times:

```sh
curl --fail --get 'https://www.hebcal.com/zmanim' \
  --data-urlencode 'cfg=json' \
  --data-urlencode 'zip=21209' \
  --data-urlencode 'date=2026-11-15'
```

Fetch minyan listings (replace the date and weekday together):

```sh
curl --fail --get 'https://baltimorejewishlife.com/wp-json/minyan-times/v1/times' \
  --data-urlencode 'city=Baltimore' \
  --data-urlencode 'day=Sunday' \
  --data-urlencode 'date=2026/11/15' \
  --data-urlencode 'type=Mincha/Maariv' \
  --data-urlencode 'sortBy=time'
```

Prayer types are `Shacharis`, `Mincha`, `Mincha/Maariv`, and `Maariv`. The short curl example omits holiday filters; for the same special-day behavior as the website, use all the calendar flags as the script does.

## Verification

Run `node --test tests/minyanim.test.cjs`. Tests mock Apps Script services and do not send email. They cover fixed and relative times, timezone/DST handling, request filters, retry limits, JSON errors, and cleanup/send ordering.
