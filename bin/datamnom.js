'use strict';

var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var client = require('../src/client');
var ProgressBar = require('progress');
var ProgressStream = require('../src/Progress');
var FixedLengthIngestor = require('../src/ingesters/fixed-length-text');
var config = require(path.normalize(__dirname + '/../inbound/FY2013.json'));
var destination = new FixedLengthIngestor();
var esConfig = config.destinations.elasticsearch;

destination.on('error', function (e) {
	console.error(e.stack);
});

_.forEach(config.sources, function(ingestOptions, filename) {
	var sourcePath = path.normalize(__dirname + '/../inbound/' + filename);
	var source = fs.createReadStream(sourcePath);
	var fileInfo = fs.statSync(sourcePath);

	var progressBar = new ProgressBar('ingesting(' + filename + ')... [:bar] :percent', {
		complete: '=',
		incomplete: ' ',
		width: 30,
		total: fileInfo.size
	});

	var progressTracker = ProgressStream.createProgressStream(fileInfo.size);
	progressTracker.onprogress = _.throttle(function () {
		progressBar.update(this.progress / 100);
	}, 50);

	client.indices.get({index: esConfig.index})
		.catch(function() {
			return client.indices.create({index: esConfig.index});
		})
		.then(function() {
			// @todo type is still hardcoded
			return client.indices.getMapping({index: esConfig.index, type: 'vendorTransaction'});
		})
		.then(function(mapping) {
			if (!Object.keys(mapping).length) {
				throw new Error('No mapping.');
			}
		})
		.catch(function() {
			return client.indices.putMapping({
				index: esConfig.index,
				// @todo type is still hardcoded
				type: 'vendorTransaction',
				body: esConfig.types
			});
		})
		.then(function() {
			return source.pipe(progressTracker).pipe(destination);
		})
		.catch(function (e) {
			console.error(e.stack);
		})
		.done();
});
