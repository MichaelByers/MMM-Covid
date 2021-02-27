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
const moment = require('moment');

const FILE_PATH = '/home/pi/MagicMirror/modules/MMM-Covid/';
const TOKEN_FILE = `MMM-Covid.json`;

var moduleInstance = null;
var config = null;

/**
 * Calculate the simple moving average of an array. A new array is returned with the average
 * of each range of elements. A range will only be calculated when it contains enough elements to fill the range.
 *
 * ```js
 * console.log(sma([1, 2, 3, 4, 5, 6, 7, 8, 9], 4));
 * //=> [ '2.50', '3.50', '4.50', '5.50', '6.50', '7.50' ]
 * //=>   │       │       │       │       │       └─(6+7+8+9)/4
 * //=>   │       │       │       │       └─(5+6+7+8)/4
 * //=>   │       │       │       └─(4+5+6+7)/4
 * //=>   │       │       └─(3+4+5+6)/4
 * //=>   │       └─(2+3+4+5)/4
 * //=>   └─(1+2+3+4)/4
 * ```
 * @param  {Array} `arr` Array of numbers to calculate.
 * @param  {Number} `range` Size of the window to use to when calculating the average for each range. Defaults to array length.
 * @param  {Function} `format` Custom format function called on each calculated average. Defaults to `n.toFixed(2)`.
 * @return {Array} Resulting array of averages.
 * @api public
 */

function smavg(arr, range) {
  var num = range || arr.length;
  var res = [];
  var len = arr.length + 1;
  var idx = num - 1;
  while (++idx < len) {
    res.push(Math.round(avg(arr, idx, num)));
  }
  return res;
 }

/**
 * Create an average for the specified range.
 *
 * ```js
 * console.log(avg([1, 2, 3, 4, 5, 6, 7, 8, 9], 5, 4));
 * //=> 3.5
 * ```
 * @param  {Array} `arr` Array to pull the range from.
 * @param  {Number} `idx` Index of element being calculated
 * @param  {Number} `range` Size of range to calculate.
 * @return {Number} Average of range.
 */

function avg(arr, idx, range) {
  return sum(arr.slice(idx - range, idx)) / range;
 }

/**
 * Calculate the sum of an array.
 * @param  {Array} `arr` Array
 * @return {Number} Sum
 */

function sum(arr) {
  var len = arr.length;
  var num = 0;
  while (len--) num += Number(arr[len]);
  return num;
 }


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
    var casesA = [];
    var hospA = [];
    var deathA = [];
    var dates = [];
    var myFileId = null;
    const drive = google.drive({version: 'v3', auth});
    const folderId = '1bBAC7H-pdEDgPxRuU_eR36ghzc0HWNf1';  //state of CO shared folder on google drive
    var dest = FILE_PATH+'data.csv';
    var self = this;

    try {
      const { files } = (await drive.files.list({
        q: `'${folderId}' in parents and name contains 'covid19_case_summary'`,
        pageSize: 10,
        orderBy: 'name desc',
        fields: 'files(id, name)',
      })).data;

      console.log(`[MMM-Covid] Found ${files.length} documents in drive. ${files[0].name}`);
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
                dates.push(moment(item.attribute).format('MM-DD'));
              }
              else if ((item.description == 'Cumulative Number of Hospitalized Cases of COVID-19 in Colorado by Date of Illness Onset') && (item.metric == 'Cases')) {
                element = { date: moment(item.attribute).format('MM-DD'),
                            value: item.value};
                hTemp.push(element);
              }
              else if ((item.description == 'Number of Deaths From COVID-19 in Colorado by Date of Death - By Day') && (item.metric == 'Deaths')) {
                element = { date: moment(item.attribute).format('MM-DD'),
                            value: item.value};
                dTemp.push(element);
              }
            });
            // sync up dates, data structures are slightly misaligned
            // and make hosp based on each day vs cumulative
            var d = 1;
            var h = 3; //hospital data starts a little early
            hosp[0] = 0;
            death[0] = 0;

            for(x=1; x<dates.length; x++) {
              if(typeof hTemp[h] === 'undefined') {
                hosp[x] = null;
              } else {
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
                if(dates[x] == dTemp[d].date) {
                  death[x] = dTemp[d].value;
                  d=d+1;
                } else {
                  death[x] = null;
                }
              } 
            }
            // create 7 day rolling averages
            casesA = smavg(cases, 7);
            hospA = smavg(hosp, 7);
            deathA = smavg(death, 7);
            console.log('[MMM-Covid] Sending Notice');
            moduleInstance.sendSocketNotification(
              'GOT-COVID',
              { total: total, dates: dates, cases: casesA, hosp: hospA, deaths: deathA }
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
  },

});

