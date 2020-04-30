/* Magic Mirror
 * Node Helper: MMM-Covid
 *
 * By Michael Byers
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
const fs = require('fs');
const { google } = require('googleapis');
const csvToJson = require('convert-csv-to-json');

const FILE_PATH = '/home/pi/MagicMirror/modules/MMM-Covid/';
const TOKEN_FILE = `MMM-Covid.json`;

var moduleInstance = null;
var config = null;

module.exports = NodeHelper.create({
  start() {
    moduleInstance = this;
  },

  /**
   * Create an OAuth2 client with the given credentials, and then execute the
   * given callback function.
   * @param {Object} credentials The authorization client credentials.
   * @param {function} callback The callback to call with the authorized client.
   */
  authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );
    token_file = `${this.path}/`+TOKEN_FILE;
    console.log('token file: '+token_file);
    // Check if we have previously stored a token.
    fs.readFile(token_file, (err, token) => {
      if (err) {
          console.log(err); 
          return this.getNewToken(oAuth2Client, callback);
      }
      oAuth2Client.setCredentials(JSON.parse(token));
      callback(oAuth2Client);
      return false;
    });
  },

  /**
   * Get and store new token after prompting for user authorization, and then
   * execute the given callback with the authorized OAuth2 client.
   * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
   * @param {getEventsCallback} callback The callback for the authorized client.
   */
  getNewToken(oAuth2Client, callback) {
    console.log(
        '[MMM-Covid] Creating a token is an interactive process that requires user input. For that please run \\"node authorize.js\\" in the MMM-GoogleDocs-Notes directory'
    );
  },

  /**
   * Retrieves note from google drive and sends information to the browser.
   * @param {google.auth.OAuth2} auth The authenticated Google OAuth 2.0 client.
   */
  async getNoteData(auth) {
  
    var total = 0;
    var coData = null;
    var cases = [];
    var hTemp = [];
    var hosp = [];
    var dTemp = [];
    var death = [];
    var dates = [];
    var myFileId = null;
    const drive = google.drive({version: 'v3', auth});
    const folderId = '1bBAC7H-pdEDgPxRuU_eR36ghzc0HWNf1';  //state of CO shared folder on google drive
    var dest = FILE_PATH+'data.csv';

    try {
      const { files } = (await drive.files.list({
        q: `'${folderId}' in parents`,
        pageSize: 1,
        orderby: 'modifiedTime',
        fields: 'files(id, name)',
      })).data;

      console.log(`[MMM-Covid] Found ${files.length} documents in drive .`);

      if (!files.length > 0) {
        console.log('[MMM-Covid] Did not find a file in shared drive.');
      } else {
        myFileId = files[0].id;
        try {
          // now try to export
          drive.files.get({
            fileId: myFileId,
            alt: 'media'
          }, (err1, res1) => {
            if (err1) return console.log('[MMM-Covid] The Export API returned an error: ' + err1);
            fs.writeFileSync(dest, res1.data);
            coData = csvToJson.fieldDelimiter(',').getJsonFromCsv(dest);
            total = coData[0].value;            
            // extract data we want
            console.log('[MMM-Covid] Parsing Data...');
            coData.forEach(function(item){
              var element = null;
              if ((item.description == 'Cases of COVID-19 in Colorado by Date of Illness Onset') && (item.metric == 'Three-Day Moving Average Of Cases')) {
                cases.push(item.value);
                dates.push(item.attribute);
              }
              else if ((item.description == 'Cumulative Number of Hospitalized Cases of COVID-19 in Colorado by Date of Illness Onset') && (item.metric == 'Cases')) {
                element = { date: item.attribute,
                            value: item.value};
                hTemp.push(element);
              }
              else if ((item.description == 'Number of Deaths From COVID-19 in Colorado by Date of Death - By Day') && (item.metric == 'Deaths')) {
                element = { date: item.attribute,
                            value: item.value};
                dTemp.push(element);
              }
            });
            // sync up dates, data structures are slightly misaligned
            // and make hosp based on each day vs cumulative
            var d = 1;
            var h = 1;
            hosp[0] = 0;
            death[0] = 0;

            for(x=1; x<dates.length; x++) {
              if(typeof hTemp[h] === 'undefined') {
                hosp[x] = null;
              } else {
                console.log(h+' '+hTemp[h]);
                if (dates[x] == hTemp[h].date) {
                  hosp[x] = hTemp[h].value - hTemp[h-1].value;
                  h=h+1;
                } else {
                  hosp[x] = null;
                }
              }
              if(typeof dTemp[d] === 'undefined') {
                death[x] = null;
              } else {
                console.log(d+' '+dTemp[d]);
                if(dates[x] == dTemp[d].date) {
                  death[x] = dTemp[d].value;
                  d=d+1;
                } else {
                  death[x] = null;
                }
              } 
            }

            console.log('[MMM-Covid] Sending Notice');
            moduleInstance.sendSocketNotification(
              'GOT-COVID',
              { total: total, dates: dates, cases: cases, hosp: hosp, deaths: death }
            );
          });

        } catch (err) {
          console.log(
            `[MMM-Covid] Failed to get the content of your note. The docs API returned an error: ${err}`
          );
        }
      }
    } catch (err) {
      console.log(
        `[MMM-Covid] Failed to list the documents in your drive. The docs API returned an error: ${err}`
      );
    }
  },

  /* socketNotificationReceived(notification, payload)
	 * This method is called when a socket notification arrives.
	 *
	 * argument notification string - The identifier of the noitication.
	 * argument payload mixed - The payload of the notification.
	 */
  socketNotificationReceived(notification, payload) {
    if (notification === 'GET-COVID') {
      if (config == null) {
        config = payload;
      }

      //console.log(`[MMM-GoogleDocs-Notes] TOKEN_PATH:${TOKEN_PATH}`);

      // Load client secrets from a local file.
      fs.readFile(`${this.path}/client_secret.json`, (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
        // Authorize a client with credentials, then call the Google Docs API.
        console.log('[MMM-Covid] authorizing...');
        this.authorize(JSON.parse(content), this.getNoteData);
        return false;
      });
    }
  }
});

