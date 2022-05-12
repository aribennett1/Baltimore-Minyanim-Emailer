function main() {
removeOldEmails();
const apiToken = ""; //enter your ScrapingAnt Api key here
const urls =["https://api.scrapingant.com/v1/general?url=https%3A%2F%2Fbaltimorejewishlife.com%2Fminyanim%2Fshacharis.php%3FminyanType%3DSH&return_text=true", "https://api.scrapingant.com/v1/general?url=https%3A%2F%2Fbaltimorejewishlife.com%2Fminyanim%2Fshacharis.php%3FminyanType%3DMI&return_text=true", "https://api.scrapingant.com/v1/general?url=https%3A%2F%2Fbaltimorejewishlife.com%2Fminyanim%2Fshacharis.php%3FminyanType%3DMM&return_text=true", "https://api.scrapingant.com/v1/general?url=https%3A%2F%2Fbaltimorejewishlife.com%2Fminyanim%2Fshacharis.php%3FminyanType%3DMA&return_text=true"];
const tefilla = ["Shachris", "Mincha", "Mincha - Maariv", "Maariv"];
for (var i = 3; i > -1; i--) { //Sent in reverse order so will appear in order in inbox
    emailTimes(getTimes(urls[i], apiToken), tefilla[i]);
    console.log(`Sent ${tefilla[i]}`);
    Utilities.sleep(3000); //sleeping to help avoid bot detection
  }
}

function removeOldEmails() {
var zmanim = GmailApp.getUserLabelByName("Zmanim");
var oldThreads = zmanim.getThreads();
var oldThread;
console.log("removing " + oldThreads.length + " emails...")
for (var i = 0; i < oldThreads.length; i++) {
    oldThreads[i].MoveToTrash();
  }
  console.log("Finished removing old emails!");
}

function getTimes(url, apiToken) {
  var headers = {"headers":{'x-api-key': apiToken}};
  var response;
  var gotten = false;
  while (!gotten) {
  try {
   response = UrlFetchApp.fetch(url, headers);
   gotten = true;
  }
  catch(err) {
    console.log("Error, trying again...");
    Utilities.sleep(3000);
  }
  }
  response = response.getContentText().replace(/(?:\\[rn])+/g, "\r");
  var begIndex = response.indexOf("SHULS/MINYANIM");
  var endIndex = response.indexOf("\",\"cookies\":\"");
  response = response.substring(begIndex + 15, endIndex);
  console.log(response);
  return response;
}

function emailTimes(text, tefilla) {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "Zmanim: " + tefilla, text, {
      name: 'Baltimore Minyanim'
  });
}
