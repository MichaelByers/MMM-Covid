/* global Module */

/* Magic Mirror
 * Module: MMM-Covid
 *
 * By Michael Byers https://github.com/MichaelByers/
 * MIT Licensed.
 */

Module.register("MMM-Covid", {
    defaults: {
        width       : 200,
        height      : 200,
        interval:   120000,
        chartConfig : {}
    },

    getScripts: function() {
		return ["moment.js", "Chart.bundle.min.js"];
	},

    getStyles: function() {
        return ['covid.css', 'font-awesome.css'];
    },

	start: function() {
        Log.log('Starting module: ' + this.name);
        var self = this;

        // Set up the local values, here we construct the request url to use
        this.loaded = false;
        this.total = 0;
        this.cases = null;
        this.deaths = null;
        this.hosp = null;
        this.dates = null;
        this.url = ['https://covidtracking.com/api/states?state=CO', 'https://covidtracking.com/api/states/daily?state=CO'];
        this.config = Object.assign({}, this.defaults, this.config);

        this.getCovidData(this);

        setInterval(function() {
            self.getCovidData(self);
          }, self.config.interval);

    },

    getCovidData: function(_this) {
		// get latest data
        _this.sendSocketNotification('GET-COVID', _this.url);
    },

	getDom: function() {
        // Create wrapper element
        var wrapper = document.createElement('div');

        if (this.loaded) {
//	 	    wrapper.className = 'data';
            wrapper.setAttribute("style", "position: relative; display: inline-block;");
            // create today's data row
            dataRow = document.createElement('div');
			var title = 'As of ';
			var today = '';
			var text = '';

			today = moment().format('MMMM Do');
			text = title + today + ' : ' + this.total;

            dataRow.innerHTML = text;
            wrapper.appendChild(dataRow);
            // Create chart canvas
            var chartEl = document.createElement("canvas");
            chartEl.width  = this.config.width;
            chartEl.height = this.config.height;
            
            // build chart
            this.config.chartConfig = {
                type: 'line',
                data: {
                  labels: this.dates,
                  datasets: [{ 
                      data: this.cases,
                      label: "Positive",
                      borderColor: "#3e95cd",
                      fill: false
                    }, { 
                        data: this.deaths,
                        label: "Deaths",
                        borderColor: "#8b0000",
                        fill: false
                      }, { 
                        data: this.hosp,
                      label: "Hospitalized",
                      borderColor: "#8e5ea2",
                      fill: false
                    }
                  ]
                },
                options: {
                  title: {
                    display: true,
                    text: 'Colorado Cases'
                  }
                }
            };

            // Init chart.js
            this.chart = new Chart(chartEl.getContext("2d"), this.config.chartConfig);

            // Append chart
            wrapper.appendChild(chartEl);

        } else {
            // Otherwise lets just use a simple div
            wrapper.innerHTML = 'LOADING...';
        }

		return wrapper;
    },
    
    socketNotificationReceived: function(notification, payload) {
        // check to see if the response was for us and used the same url
        if (notification === 'GOT-COVID') {  //&& payload.url === this.url) {
                // we got some data so set the flag, stash the data to display then request the dom update
                this.loaded = true;
                this.total = payload.total;
                this.dates = payload.dates;
                this.cases = payload.cases;
                this.deaths = payload.deaths;
                this.hosp = payload.hosp;
                this.updateDom(1000);
        }
    }

});
