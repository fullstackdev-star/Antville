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
 * @fileOverview Defines the Tag prototype.
 */

markgettext('Tag');
markgettext('tag');
markgettext('a tag // accusative');

/**
 * @constant
 */
Tag.MOUNTPOINTS = {
  Story: 'tags',
  Image: 'galleries'
}

/**
 * @constant
 */
Tag.DELIMITER = ', ';

/**
 * @param {String} name
 * @param {Site} site
 * @param {String} type
 */
Tag.add = function(name, type, site) {
  var tag = new Tag;
  tag.name = name;
  tag.type = type;
  tag.site = site;
  site.$tags.add(tag);
  return tag;
}

/**
 * @name Tag
 * @constructor
 * @property {TagHub[]} _children
 * @property {Images[]} images
 * @property {String} name
 * @property {Site} site
 * @property {Story[]} stories
 * @property {String} type
 * @extends HopObject
 */
Tag.prototype.constructor = function() {
  HopObject.confirmConstructor(Tag);
  return this;
}

/**
 *
 * @param {String} action
 * @returns {Boolean}
 */
Tag.prototype.getPermission = function(action) {
  if (!res.handlers.site.getPermission('main')) {
    return false;
  }
  switch (action) {
    case '.':
    case 'main':
    case 'rss.xml':
    return true;
    case 'edit':
    case 'delete':
    case 'rename':
    return User.require(User.PRIVILEGED) ||
        Membership.require(Membership.MANAGER);
  }
  return false;
}

Tag.prototype.main_action = function() {
  res.handlers.list = new jala.ListRenderer(this.getTagged());
  res.handlers.list.setPageSize(this.site.pageSize);
  res.data.title = gettext('Tag: {0}', this.name);
  res.data.body = this.renderSkinAsString('$Tag#main');
  res.handlers.site.renderSkin('Site#page');
  res.handlers.site.log();
  return;
}

Tag.prototype.rss_xml_action = function() {
  res.contentType = 'text/xml';
  res.dependsOn(this.site.modified);
  res.digest();
  var tagHubs = this.getTagged().list(0, this.site.pageSize);
  var stories = [];
  for (var i in tagHubs) {
    stories.push(tagHubs[i].tagged);
  }
  this.site.renderXml(stories);
  return;
}

Tag.prototype.rename_action = function() {
  var tag = this;

  if (req.data.name) {
    // Trim and remove troublesome characters  (like ../.. etc.)
    // We call getAccessName with a virgin HopObject to allow most names
    var name = this.getAccessName.call(new HopObject, req.data.name);

    tag = this.site.getTags(this.type, Tags.ALL).get(name);

    if (!tag) {
      tag = Tag.add(name, this.type, this.site);
    }

    if (tag !== this) {
      this.forEach(function() {
        this.tag_id = tag._id;
      });

      this.remove();
      res.commit();
    }
  }

  res.redirect(req.data.http_referer);
  return;
}

Tag.prototype.delete_action = function() {
  var parent = this._parent;
  while (this.size() > 0) {
    this.get(0).remove();
  };
  this.remove();
  res.redirect(this.site[Tag.MOUNTPOINTS[this.type]].href());
}

/**
 *
 * @param {String} action
 * @returns {String}
 */
Tag.prototype.href = function(action) {
  res.push();
  res.write(this.site[Tag.MOUNTPOINTS[this.type]].href());
  res.write(encodeURIComponent(this.name));
  res.write('/');
  if (action) {
    res.write(java.net.URLEncoder.encode(action));
  }
  return res.pop();
}

/**
 *
 * @param {Object} param
 * @param {String} type
 */
Tag.prototype.permission_macro = function(param, type) {
  return this.getPermission(type);
}

// FIXME: HopObject.type_macro() returns this._prototype
Tag.prototype.type_macro = function (param, self) {
  return self ? this.type : HopObject.prototype.type_macro.apply(this, arguments);
};

Tag.prototype.size_macro = function () {
  res.write(this.getTagged().size());
  return;
};

/**
 * @returns {Story[]|Image[]}
 */
Tag.prototype.getTagged = function() {
  return this[pluralize(this.type.toLowerCase())];
}

/**
 * @returns {String}
 */
Tag.prototype.getTitle = function() {
  return this.name;
}

/**
 * @returns {String}
 */
Tag.prototype.toString = function() {
  return this.type + ' tag ' + this.name + ' of Site ' + this.site.alias;
}
