/**
 * Module dependencies.
 */
var _ = require('lodash'),
    util = require('util'),
    OAuth2Strategy = require('passport-oauth').OAuth2Strategy,
    InternalOAuthError = require('passport-oauth').InternalOAuthError,
    zlib = require('zlib'),
    Stream = require('stream'),
    request = require("request"),
    URL = require('url');

function ClearStream() {
    this.writable = true;
    this._data = "";
};
util.inherits(ClearStream, Stream);

ClearStream.prototype.write = function(chunk) {
    this._data += chunk.toString();
    return true;
}

ClearStream.prototype.end = function(data) {
    if (data) {
        this._data += data.toString();    
    }
    this.emit('finish', this._data);
}

function Strategy(options, verify) {
    options = options || {};
    options.authorizationURL = options.authorizationURL || 'https://stackexchange.com/oauth';
    options.tokenURL = options.tokenURL || 'https://stackexchange.com/oauth/access_token';
    options.scopeSeparator = options.scopeSeparator || ',';

    if(typeof options.key === "undefined") {
        throw new Error("No Stackexchange API Key");
    }

    this._options = options;
    this._apiUrl = 'https://api.stackexchange.com' + (options.apiVersion ? '/' + options.apiVersion : '');
    OAuth2Strategy.call(this, options, verify);

    this.name = 'stackexchange';
}

util.inherits(Strategy, OAuth2Strategy);

/**
  Loads a particular Stack Exchange site profile
 **/
Strategy.prototype._loadSiteProfile = function(accessToken, site, done) {

    this._doRequest({
        url: this._apiUrl + '/me',
        qs: { site: site, key: this._options.key, access_token: accessToken }
    }, function(err, data, body) {
        if (err) return done(err);

        var account = data.items[0];
        account.provider = "stackexchange";
        return done(null, account);
    });
}

/**
  Loads the users profile
 **/
Strategy.prototype.userProfile = function(accessToken, done) {
    
    var self = this;

    // If we have a given site
    if (this._options.site) {
        return this._loadSiteProfile(accessToken, this._options.site, done);
    }

    // Otherwise we need to find the current users associated sites, and get one of those
    this._doRequest({
        url: this._apiUrl + '/me/associated',
        qs: { key: this._options.key, access_token: accessToken }
    }, function(err, data, body) {
        if (err) return done(err);
        if (!data.items || !data.items.length === 0) return done('No profile information available');

        var site = URL.parse(data.items[0].site_url).host;
        return self._loadSiteProfile(accessToken, site, done);
    });
}

/**
  Perform a simple Stack Exchange request
 **/
Strategy.prototype._doRequest = function(opts, callback) {

    var destination = new ClearStream();
    destination.on('error', callback);
    destination.on('finish', function(data) {        
        var json = JSON.parse(data);
        return callback(null, json, data);
    });

    var params = _.extend(opts, { headers: {'accept-encoding': 'gzip'} });
    request(params)
        .pipe(zlib.createGunzip())
        .pipe(destination);
}

module.exports = Strategy;