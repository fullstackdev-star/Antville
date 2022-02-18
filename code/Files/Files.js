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
 * @fileOverview Defines the Comment prototype.
 */

markgettext('Files');
markgettext('files');

/**
 * @name Files
 * @constructor
 * @extends HopObject
 */

/**
 *
 * @param {String} action
 * @returns {Boolean}
 */
Files.prototype.getPermission = function(action) {
  if (!this._parent.getPermission('main')) {
    return false;
  }
  switch (action) {
    case '.':
    case 'main':
    case 'create':
    case 'user':
    return Site.require(Site.OPEN) && session.user ||
        Membership.require(Membership.CONTRIBUTOR) ||
        User.require(User.PRIVILEGED);
  }
  return false;
}

Files.prototype.create_action = function() {
  File.redirectOnUploadError(this.href(req.action));
  File.redirectOnExceededQuota(this.href());

  if (req.postParams.save) {
    try {
      var file = File.add(req.postParams);
      file.notify(req.action);
      res.message = gettext('The file was successfully added.');
      res.redirect(this.href());
    } catch (ex) {
      res.message = ex;
      app.log(ex);
    }
  }

  res.data.action = this.href(req.action);
  res.data.title = gettext('Add File');
  HopObject.confirmConstructor(File);
  res.data.body = (new File).renderSkinAsString('$File#edit');
  this._parent.renderSkin('Site#page');
  return;
}

Files.prototype.main_action = function() {
  res.data.list = renderList(this, '$File#listItem', 25, req.queryParams.page);
  res.data.pager = renderPager(this, this.href(req.action), 25, req.queryParams.page);
  res.data.title = gettext('Files');
  res.data.body = this.renderSkinAsString('$Files#main');
  this._parent.renderSkin('Site#page');
  return;
}

Files.prototype.user_action = function() {
  var files = User.getMembership().files;
  res.data.list = renderList(files, '$File#listItem', 25, req.queryParams.page);
  res.data.pager = renderPager(files, this.href(), 25, req.queryParams.page);
  res.data.title = gettext('Files by {0}', session.user.name);
  res.data.body = this.renderSkinAsString('$Files#main');
  this._parent.renderSkin('Site#page');
  return;
}
