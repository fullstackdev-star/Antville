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
 * @fileOverview Defines the Polls prototype
 */

markgettext('Polls');
markgettext('polls');

/**
 * @name Polls
 * @constructor
 * @property {Poll[]} _children
 * @property {Poll[]} open
 * @extends HopObject
 */

/**
 *
 * @param {String} action
 * @returns {Boolean}
 */
Polls.prototype.getPermission = function(action) {
  if (!this._parent.getPermission('main')) {
    return false;
  }
  switch (action) {
    case '.':
    case 'main':
    case 'create':
    case 'running':
    case 'user':
    return Site.require(Site.OPEN) && session.user ||
        Membership.require(Membership.CONTRIBUTOR) ||
        User.require(User.PRIVILEGED);
  }
  return false;
}

Polls.prototype.main_action = function() {
  res.data.list = renderList(this, '$Poll#listItem', 25, req.queryParams.page);
  res.data.pager = renderPager(this, this.href(), 25, req.queryParams.page);
  res.data.title = gettext('All Polls');
  res.data.body = this.renderSkinAsString('$Polls#main');
  this._parent.renderSkin('Site#page');
  return;
}

Polls.prototype.create_action = function() {
  if (req.postParams.save) {
    try {
      var poll = Poll.add(req.postParams, this._parent);
      poll.notify(req.action);
      res.message = gettext('The poll was created successfully.');
      res.redirect(poll.href());
    } catch (err) {
      res.message = err.toString();
    }
  } else {
    req.postParams.title_array = [null];
  }
  res.data.action = this.href(req.action);
  res.data.title = gettext('Add Poll');
  HopObject.confirmConstructor(Poll);
  res.data.body = (new Poll).renderSkinAsString('$Poll#edit');
  this._parent.renderSkin('Site#page');
  return;
}

Polls.prototype.user_action = function() {
  var polls = User.getMembership().polls;
  res.data.list = renderList(polls, '$Poll#listItem', 25, req.queryParams.page);
  res.data.pager = renderPager(polls, this.href(req.action), 25, req.queryParams.page);
  res.data.title = gettext('Polls by {0}', session.user.name);
  res.data.body = this.renderSkinAsString('$Polls#main');
  this._parent.renderSkin('Site#page');
  return;
}

Polls.prototype.running_action = function() {
  res.data.list = renderList(this.running, '$Poll#listItem', 25, req.queryParams.page);
  res.data.pager = renderPager(this.running, this.href(req.action), 25, req.queryParams.page);
  res.data.title = gettext('Running Polls');
  res.data.body = this.renderSkinAsString('$Polls#main');
  this._parent.renderSkin('Site#page');
  return;
}
