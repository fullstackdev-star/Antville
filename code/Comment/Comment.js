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

markgettext('Comment');
markgettext('comment');
markgettext('a comment // accusative');

Comment.HTML_WHITELIST = Packages.org.jsoup.safety.Whitelist.relaxed();

/**
 * @see defineConstants
 */
Comment.getStatus = defineConstants(Comment, markgettext('deleted'),
    markgettext('pending'), markgettext('readonly'), markgettext('public'));

/**
 * Convenience method for easily adding a new comment to an existing story or comment.
 * @param {Object} data
 * @param {Story|Comment} parent The story or comment this comment belongs to.
 * @returns {Comment}
 */
Comment.add = function(data, parent) {
  HopObject.confirmConstructor(Comment);
  var story = parent.story || parent;
  var comment = new Comment;
  comment.name = String.EMPTY;
  comment.site = parent.site;
  comment.story = story;
  comment.parent = parent;
  comment.parent_type = parent._prototype; // FIXME: Set correct parent_type (Helma bug?)
  comment.status = Story.PUBLIC;
  comment.creator = comment.modifier = session.user;
  comment.created = comment.modified = new Date;
  comment.update(data);
  story.comments.add(comment); // Force addition to aggressively cached collection
  parent.add(comment);
  return comment;
}

/**
 * @returns {String}
 */
Comment.remove = function(options) {
  if (this.constructor !== Comment) {
    return;
  }
  // Remove all comments of this comment’s creator if corresponding option is set
  if (options && options.mode === 'user' && options.confirm === '1') {
    var membership = this.creator.getMembership();
    // Not using HopObject.remove() because it will comepletely remove all comments
    membership.comments.forEach(function() {
      Comment.remove.call(this);
    })
  } else {
    // Mark comment as deleted if not already done so or if there are child comments
    if (this.size() > 0 && this.status !== Comment.DELETED) {
      this.status = Comment.DELETED;
      this.deleteMetadata();
      this.touch();
      return this.href();
    }
    // Completely remove comment and its children otherwise
    while (this.size() > 0) {
      Comment.remove.call(this.get(0));
    }
    // Explicitely remove comment from aggressively cached collections:
    (this.parent || this).removeChild(this);
    this.story.comments.removeChild(this);
    this.deleteMetadata();
    this.remove();
  }
  return this.parent.href();
}

/**
 * @name Comment
 * @constructor
 * @property {Comment[]} _children
 * @property {String} name
 * @property {Story|Comment} parent
 * @property {Story} story
 * @extends Story
 */
Comment.prototype.constructor = function() {
  HopObject.confirmConstructor.call(this);
  return this;
}

/**
 *
 * @param {Object} action
 * @returns {Boolean}
 */
Comment.prototype.getPermission = function(action) {
  switch (action) {
    case '.':
    case 'main':
    if (this.status === Comment.DELETED) {
      return false;
    }
    // Break statement missing here by purpose!
    case 'comment':
    return this.site.commentMode === Site.ENABLED &&
        this.story.getPermission(action) &&
        this.status !== Comment.PENDING;
    case 'delete':
    return this.story.getPermission.call(this, 'delete');
    case 'edit':
    return User.require(User.PRIVILEGED) ||
        Membership.require(Membership.MANAGER) ||
        this.creator === session.user &&
        this.status !== Comment.DELETED;
    case 'filter':
    return this.creator !== session.user &&
        this.site.trollFilter.indexOf(this.creator.name) < 0 &&
        (User.require(User.PRIVILEGED) ||
        Membership.require(Membership.MANAGER));
  }
  return false;
}

/**
 *
 * @param {Object} action
 * @returns {String}
 */
Comment.prototype.href = function(action) {
  var buffer = [];
  switch (action) {
    case null:
    case undefined:
    case '':
    case '.':
    case 'main':
    buffer.push(this.story.href(), '#', this._id);
    break;
    default:
    buffer.push(this.story.comments.href(), this._id, '/', action);
  }
  return buffer.join(String.EMPTY);
}

Comment.prototype.edit_action = function() {
  if (req.postParams.save) {
    try {
      this.update(req.postParams);
      delete session.data.backup;
      res.message = gettext('The comment was successfully updated.');;
      res.redirect(this.href());
    } catch (ex) {
      res.message = ex;
      app.log(ex);
    }
  }

  res.handlers.parent = this.parent;
  res.data.action = this.href(req.action);
  res.data.title = gettext('Edit Comment');
  res.data.body = this.renderSkinAsString('Comment#edit');
  this.site.renderSkin('Site#page');
  return;
};

Comment.prototype.filter_action = function () {
  var username = this.creator.name;
  var trollFilter = this.site.trollFilter;
  if (trollFilter.indexOf(username) < 0) {
    trollFilter.push(username);
    this.site.setMetadata('trollFilter', trollFilter);
  }
  res.redirect(req.data.http_referer);
};

/**
 *
 * @param {Object} data
 */
Comment.prototype.update = function(data) {
  if (data.text && !User.require(User.TRUSTED) && !Membership.require(Membership.CONTRIBUTOR)) {
    data.text = sanitizeHtml(data.text, Comment.HTML_WHITELIST);
  }

  if (!data.text) {
    throw Error(gettext('Please enter something into the comment field.'));
  }

  data.title = data.title ? stripTags(data.title) : String.EMPTY;
  var delta = this.getDelta(data);

  this.text = data.text;
  this.title = data.title;
  this.setCustomContent(data);

  if (this.story.commentMode === Story.MODERATED) {
    this.status = Comment.PENDING;
  } else if (delta > 50) {
    this.modified = new Date;

    if (this.story.status !== Story.CLOSED) {
      this.site.modified = this.modified;
    }

    // We need persistence for adding the callback
    if (this.isTransient()) this.persist();

    res.handlers.site.callback(this);

    // Notification is sent in Story.comment_action()
  }

  this.clearCache();
  this.modifier = session.user;
  return;
}

/**
 * @returns {String}
 */
Comment.prototype.getConfirmText = function() {
  var size = this.size() + 1;
  if (this.status === Comment.DELETED && size > 1) {
    return gettext('You are about to delete a comment thread consisting of {0} postings.', size);
  }
  return gettext('You are about to delete a comment by {0}.', this.creator.name);
};

Comment.prototype.getConfirmExtra = function () {
  if (this.getMacroHandler('related').size() > 0) {
    return this.renderSkinAsString('$Comment#delete');
  }
};

Comment.prototype.isGaslighted = function () {
  var creatorIsTroll = this.site.trollFilter.indexOf(this.creator.name) > -1;
  if (session.user && creatorIsTroll) {
    return session.user.name !== this.creator.name;
  }
  return creatorIsTroll;
};

/**
 *
 * @param {String} name
 * @returns {HopObject}
 */
Comment.prototype.getMacroHandler = function(name) {
  switch (name) {
    case 'related':
    var membership = this.creator.getMembership();
    if (!membership || membership.comments.size() < 2 || this.status === Comment.DELETED) {
      return new HopObject(); // Work-around for issue 88
    }
    return membership.comments;

    case 'story':
    return this.story;

    case 'top':
    var top = this;
    while (top) {
      if (top.parent.constructor === Story) return top;
      top = top.parent;
    }
  }
  return Story.prototype.getMacroHandler.apply(this, arguments);
};

/**
 *
 */
Comment.prototype.text_macro = function() {
  if (this.status === Comment.DELETED) {
    res.write('<em>');
    res.write(this.modifier === this.creator ?
        gettext('This comment was removed by the author.') :
        gettext('This comment was removed.'));
    res.writeln('</em>');
  } else if (this.isGaslighted()) {
    res.write('<em>');
    res.write('This comment is gaslighted.');
    res.write('</em>');
  } else {
    res.write(this.text);
  }
  return;
}

/**
 *
 */
Comment.prototype.creator_macro = function() {
  return this.status === Comment.DELETED ? null :
      HopObject.prototype.creator_macro.apply(this, arguments);
}

/**
 *
 */
Comment.prototype.modifier_macro = function() {
  return this.status === Comment.DELETED ? null :
      HopObject.prototype.modifier_macro.apply(this, arguments);
}

Comment.prototype.meta_macro = function (param) {
  if (this.status === Comment.PUBLIC && !this.isGaslighted()) {
    this.renderSkin('Comment#meta');
  }
};

Comment.prototype.badge_macro = function () {
  var cls = {'class': 'uk-badge uk-badge-primary'};
  if (this.creator.status === User.PRIVILEGED) {
    html.element('span', gettext('Admin'), cls);
  } else {
    var membership = Membership.getByName(this.creator.name);
    if (membership && membership.role !== 'subscriber') {
      html.element('span', gettext(membership.role.titleize()), cls);
    }
  }
};

Comment.prototype.level_macro = function () {
  var level = 0;
  var comment = this;
  while (comment.parent.constructor !== Story) {
    level += 1;
    comment = comment.parent;
  }
  res.write(level);
};
