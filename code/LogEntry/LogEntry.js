// The Antville Project
// http://code.google.com/p/antville
//
// Copyright 2001–2014 by the Workers of Antville.
//
// Licensed under the Apache License, Version 2.0 (the ``License'');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an ``AS IS'' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileOverview Defines the LogEntry prototype.
 */

markgettext('Log Entry');
markgettext('log entry');

/**
 * @name LogEntry
 * @constructor
 * @param {HopObject} context
 * @param {String} action
 * @property {String} action
 * @property {HopObject} context
 * @property {Number} context_id
 * @property {String} context_type
 * @property {Date} created
 * @property {User} creator
 * @property {String} referrer
 * @extends HopObject
 */
LogEntry.prototype.constructor = function(context, action) {
  this.context = context;
  this.action = action;
  this.referrer = req.data.http_referer;
  this.creator = session.user;
  this.created = new Date;
  this.ip = req.data.http_remotehost; // Won't be stored in database
  this.site = res.handlers.site;
  return this;
}

/**
 * @returns {String}
 */
LogEntry.prototype.toString = function() {
  return '[LogEntry #' + this._id + ': ' + (this.creator || 'anonymous') +
      ' requested ' + this.action + ' action of ' + this.context_type +
      ' #' + this.context_id + ' on ' + formatDate(this.created) + ']';
}

/**
 *
 * @param {String} name
 * @returns {HopObject}
 */
LogEntry.prototype.getMacroHandler = function(name) {
  switch (name) {
    case 'context':
    return this.context || {name: this.context_id};
  }
  return null;
}
