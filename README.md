# Baltimore-Minyanim-Emailer
This code works with Google Apps Scripts to send four daily emails (Shachris, Mincha, Mincha-Maariv, and Maariv) with the times for minyanim in Baltimore (as posted on Baltimore Jewish Life).

You will need to create your own Scraping Ant account to get an API Token. You can sign up here: https://app.scrapingant.com/login

Once you sign up, copy your API token and paste it in the quotes of the first line of the code.

The script is set to delete the previous day's email before sending the times for the current day - if you want to disable this feature, delete "removeOldEmails();" on line 2.

Set a trigger for every day after 12:00 a.m and you're all set!
