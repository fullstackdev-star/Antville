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
 * @fileOverview Defines the User prototype.
 */

markgettext('Account');
markgettext('account');
markgettext('a account // accusative');

this.handleMetadata('accepted');
this.handleMetadata('deleted');
this.handleMetadata('export');
this.handleMetadata('hash');
this.handleMetadata('job');
this.handleMetadata('notes');
this.handleMetadata('salt');
this.handleMetadata('url');

disableMacro(User, 'hash');
disableMacro(User, 'salt');

/** @constant */
User.COOKIE = getProperty('userCookie', 'antvilleUser');

/** @constant */
User.HASHCOOKIE = getProperty('hashCookie', 'antvilleHash');

/**
 * @param {Object} data
 * @returns {User}
 */
User.add = function(data) {
  HopObject.confirmConstructor(this);
  var user = new User;
  var now = new Date;
  user.map({
    created: now,
    modified: now,
    email: data.email,
    hash: data.hash,
    name: data.name,
    salt: session.data.token,
    status: User.REGULAR,
    url: data.url
  });
  root.users.add(user);
  return user;
}

User.remove = function() {
  if (this.constructor !== User) return;

  const deleteMetadata = (type, table, id) => {
    app.log('Removing ' + table + ' metadata for User #' + id);
    sql.execute("delete from metadata where parent_type = '$0' and parent_id in (select id from $1 where creator_id = $2)", type, table, id);
  };

  const getNewCreator = site => {
    if (!site) return null;
    const owners = site.members.owners;
    if (owners.size() < 1) return null;
    return owners.list().filter(owner => owner.name !== this.name)[0].creator;
  };

  const sql = new Sql();
  const id = this._id;

  app.log('Removing data from account #' + id);
  sql.execute("delete from metadata where parent_type = 'User' and parent_id = $0", id);

  // Remove sites
  this.ownerships.forEach(function() {
    const owners = this.site.members.owners;
    if (owners.size() < 2) {
      // Delegate deletion of Sites which user is the only owner of
      Site.remove.call(this.site);
    }
  });

  // Re-assign site creators and modifiers
  sql.retrieve('select id from site where creator_id = $0', id);
  sql.traverse(function() {
    const site = Site.getById(this.id);
    const creator = getNewCreator(site);
    sql.execute('update site set creator_id = $0 where creator_id = $1', creator._id, id);
  });
  sql.execute('update site set modifier_id = creator_id where modifier_id = $0', id);

  // Remove and re-assign memberships
  sql.execute("delete from membership where name = '$0'", this.name);
  sql.execute('update membership set modifier_id = creator_id where modifier_id = $0', id);

  // Remove tags
  sql.execute("delete from tag_hub where tagged_type = 'Story' and tagged_id in (select id from content where creator_id = $0)", id);
  sql.execute("delete from tag_hub where tagged_type = 'Image' and tagged_id in (select id from image where creator_id = $0)", id);
  sql.execute('delete from tag where id not in (select tag_id from tag_hub)');

  // Remove and re-assign polls, choices and votes
  let subQuery = 'select id from poll where creator_id';
  sql.execute('delete from vote where choice_id in (select id from choice where poll_id in ($0 = $1))', subQuery, id);
  sql.execute('delete from choice where poll_id in ($0 = $1)', subQuery, id);
  sql.execute('delete from poll where creator_id = $0', id);
  sql.execute('update poll set modifier_id = creator_id where modifier_id = $0', id);

  // Remove and re-assign stories and comments
  deleteMetadata('Story', 'content', id);
  sql.execute('delete from content where creator_id = $0', id);
  sql.execute('update content set modifier_id = creator_id where modifier_id = $0', id);

  // Remove and re-assign files
  sql.retrieve('select id from file where creator_id = $0', id);
  sql.traverse(function() {
    app.log('Removing file #' + this.id + ' from file system');
    const file = File.getById(this.id);
    file.getFile().remove();
  });
  deleteMetadata('File', 'file', id);
  sql.execute('delete from file where creator_id = $0', id);
  sql.execute('update file set modifier_id = creator_id where modifier_id = $0', id);

  // Remove and re-assign images
  sql.retrieve('select id from image where creator_id = $0', id);
  sql.traverse(function() {
    const image = Image.getById(this.id);
    if (image.parent_type === 'Layout') {
      if (!image.parent) return;
      // Instead of deleting, assign layout images to another site owner
      app.log('Assigning new creator: layout image #' + this.id);
      const creator = getNewCreator(image.parent.site);
      sql.execute('update image set creator_id = $0 where creator_id = $1', creator._id, id);
    } else {
      app.log('Removing image #' + this.id + ' from file system')
      image.getFile().remove();
    }
  });
  deleteMetadata('Image', 'image', id);
  sql.execute('delete from image where creator_id = $0', id);
  sql.execute('update image set modifier_id = creator_id where modifier_id = $0', id);

  // Remove and re-assign skins
  sql.retrieve('select id from skin where creator_id = $0', id);
  sql.traverse(function() {
    // Instead of deleting, assign skins to another site owner
    app.log('Assigning new creator: skin #' + this.id);
    const skin = Skin.getById(this.id);
    const creator = getNewCreator(skin.layout.site);
    sql.execute('update skin set creator_id = $0 where creator_id = $1', creator._id, id);
  });
  sql.execute('update skin set modifier_id = creator_id where modifier_id = $0', id);

  // Remove and re-assign layouts
  sql.retrieve('select id from layout where creator_id = $0', id);
  sql.traverse(function() {
    // Instead of deleting, assign layouts to another site owner
    app.log('Assigning new creator: layout #' + this.id);
    const layout = Layout.getById(this.id);
    const creator = getNewCreator(layout.site);
    sql.execute('update layout set creator_id = $0 where creator_id = $1', creator._id, id);
  });
  sql.execute('update layout set modifier_id = creator_id where modifier_id = $0', id);

  this.deleted = new Date();
  this.email = String.EMPTY;
  return User.require(User.PRIVILEGED) ? this.href('edit') : root.href();
};

/**
 *
 * @param {String} name
 * @returns {User}
 */
User.getByName = function(name) {
  return root.users.get(name);
}

/**
 * @function
 * @returns {String[]}
 * @see defineConstants
 */
User.getStatus = defineConstants(User, markgettext('Deleted'), markgettext('Blocked'), markgettext('Regular'), markgettext('Trusted'), markgettext('Privileged'));

/**
 * @returns {String}
 */
User.getSalt = function() {
  var salt = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 8);
  var random = java.security.SecureRandom.getInstance('SHA1PRNG');
  random.nextBytes(salt);
  return new java.lang.String(java.util.Base64.getMimeEncoder().encode(salt), 'utf-8');
}

/**
 *
 * @param {Object} data
 * @throws {Error}
 * @returns {User}
 */
User.register = function(data) {
  if (!data.name) {
    throw Error(gettext('Please enter a username.'));
  }

  data.name = data.name.trim();
  if (data.name.length > 30) {
    throw Error(gettext('Sorry, the username you entered is too long. Please choose a shorter one.'));
  } else if (data.name !== stripTags(data.name) || NAMEPATTERN.test(data.name)) {
    throw Error(gettext('Please avoid special characters or HTML code in the name field.'));
  } else if (data.name !== root.users.getAccessName(data.name)) {
    throw Error(gettext('Sorry, the username you entered already exists. Please enter a different one.'));
  }

  data.email && (data.email = data.email.trim());
  if (!validateEmail(data.email)) {
    throw Error(gettext('Please enter a valid e-mail address'));
  }

  if (User.isBlacklisted(data)) {
    throw Error('Sequere pecuniam ad meliora.');
  }

  // Create hash from password for JavaScript-disabled browsers
  if (!data.hash) {
    if (!data.password) {
      throw Error(gettext('Could not verify your password. Please repeat your input.'))
    }
    data.hash = (data.password + session.data.token).md5();
  }

  var user = User.add(data);
  // grant trust and sysadmin-rights if there's no sysadmin 'til now
  if (root.admins.size() < 1) {
    user.status = User.PRIVILEGED;
  }
  session.login(user);
  return user;
}

/**
 *
 * @param {Object} data
 * @returns {Boolean}
 */
User.isBlacklisted = function(data) {
  if (getProperty('enableBlacklistChecks') !== 'true') return false;

  var url, mime;
  var key = getProperty('botscout.apikey');
  var email = encodeURIComponent(data.email);
  var ip = encodeURIComponent(data.http_remotehost);

  if (key) {
    url = ['http://botscout.com/test/?multi', '&key=', key, '&mail=', email, '&ip=', ip];

    try {
      mime = getURL(url.join(String.EMPTY));
      if (mime && mime.text && mime.text.startsWith('Y')) {
        return true;
      }
    } catch (ex) {
      app.log('Exception while trying to check blacklist URL ' + url);
      app.log(ex);
    }
  }

  // We only get here if botscout.com does not already blacklist the ip or email address
  url = ['http://www.stopforumspam.com/api?f=json', '&email=', email];

  if (ip.match(/^(?:\d{1,3}\.){3}\d{1,3}$/)) url.push('&ip=', ip);

  try {
    mime = getURL(url.join(String.EMPTY));
  } catch (ex) {
    app.log('Exception while trying to check blacklist URL ' + url);
    app.log(ex);
  }

  if (mime && mime.content) {
    var result = JSON.parse(new java.lang.String(mime.content));
    if (result.success) {
      return !!(result.email.appears || (result.ip && result.ip.appears));
    }
  }

  return false;
};

/**
 *
 */
User.autoLogin = function() {
  if (session.user) {
    return;
  }

  var name = req.cookies[User.COOKIE];
  var hash = req.cookies[User.HASHCOOKIE];

  if (!name || !hash) {
    return;
  }

  var user = User.getByName(name);

  if (!user || User.getAutoLoginHash(user.hash) !== hash) {
    return;
  }

  session.login(user);
  user.touch();
  res.message = gettext('Welcome to {0}, {1}. Have fun!', res.handlers.site.title, user.name);
  return;
}

User.getAutoLoginHash = function(salt) {
  const ip = req.getHeader("X-Forwarded-For") || req.data.http_remotehost;
  return (salt + ip.replace(/[0-9a-fA-F]+$/, "")).md5();
}

/**
 *
 * @param {Object} data
 * @returns {User}
 */
User.login = function(data) {
  var user = User.getByName(data.name);
  var digest = data.digest;

  if (!user) {
    throw Error(gettext('Unfortunately, your login failed. Maybe a typo?'));
  }

  // Calculate digest for JavaScript-disabled browsers
  if (!digest) {
    app.logger.warn('Received clear text password from ' + req.data.http_referer);
    digest = ((data.password + user.salt).md5() + session.data.token).md5();
  }

  // Check if login is correct
  if (digest !== user.getDigest(session.data.token)) {
    throw Error(gettext('Unfortunately, your login failed. Maybe a typo?'))
  }

  if (data.remember) {
    // Set long running cookies for automatic login
    res.setCookie(User.COOKIE, user.name, 365);
    res.setCookie(User.HASHCOOKIE, User.getAutoLoginHash(user.hash), 365);
  }

  user.touch();
  session.login(user);
  return user;
}

/**
 *
 */
User.logout = function() {
  session.logout();
  res.unsetCookie(User.COOKIE);
  res.unsetCookie(User.HASHCOOKIE);
  Layout.sandbox(false);
  User.getLocation();
  return;
}

/**
 *
 * @param {String} requiredStatus
 * @returns {Boolean}
 */
User.require = function(requiredStatus, user) {
  if (!user) user = session.user;
  var status = [User.BLOCKED, User.REGULAR, User.DELETED, User.TRUSTED, User.PRIVILEGED];
  if (requiredStatus && user) {
    return status.indexOf(user.status) >= status.indexOf(requiredStatus);
  }
  return false;
}

/**
 * @returns {String}
 */
User.getCurrentStatus = function() {
  if (session.user) {
    return session.user.status;
  }
  return null;
}

/**
 * @returns {Membership}
 */
User.getMembership = function() {
  var membership;
  if (session.user) {
    membership = Membership.getByName(session.user.name);
  }
  HopObject.confirmConstructor(Membership);
  return membership || new Membership();
};

User.prototype.getMembership = function () {
  var membership = Membership.getByName(this.name);
  if (!membership) {
    HopObject.confirmConstructor(Membership);
    membership = new Membership();
    var site = res.handlers.site;
    // FIXME: Should we do this also for stories, images etc.?
    membership.comments.subnodeRelation = "where prototype = 'Comment' and status <> 'deleted' and site_id = " + site._id + " and creator_id = " + this._id + " order by created desc";
  }
  return membership;
};

/**
 *
 * @param {String} url
 */
User.setLocation = function(url) {
  session.data.location = url || req.data.http_referer;
  //app.debug('Pushed location ' + session.data.location);
  return;
}

/**
 * @returns {String}
 */
User.getLocation = function() {
  var url = session.data.location;
  delete session.data.location;
  //app.debug('Popped location ' + url);
  return url;
}

/**
 * Rename a user account.
 * @param {String} currentName The current name of the user account.
 * @param {String} newName The desired name of the user account.
 */
User.rename = function(currentName, newName) {
  var user = User.getByName(currentName);
  if (user) {
    if (user.name === newName) {
      return newName;
    }
    user.name = root.users.getAccessName(newName);
    return user.name;
  }
  return currentName;
}

/**
 * A User object represents a login to Antville.
 * @name User
 * @constructor
 * @extends HopObject
 * @property {Membership[]} _children
 * @property {Date} created
 * @property {Comment[]} comments
 * @property {String} email
 * @property {File[]} files
 * @property {String} hash
 * @property {Image[]} images
 * @property {Membership[]} memberships
 * @property {Metadata} metadata
 * @property {Date} modified
 * @property {String} name
 * @property {String} salt
 * @property {Site[]} sites
 * @property {Membership[]} subscriptions
 * @property {String} status
 * @property {Story[]} stories
 * @property {String} url
 * @extends HopObject
 */
User.prototype.constructor = function(data) {
  HopObject.confirmConstructor(User);
  return this;
}

/**
 *
 */
User.prototype.onLogout = function() { /* ... */ }

/**
 *
 * @param {String} action
 * @returns {Boolean}
 */
User.prototype.getPermission = function(action) {
  switch (action) {
    case 'delete':
    return this.status !== User.PRIVILEGED && this.status !== User.DELETED;

    default:
    return User.require(User.PRIVILEGED);
  }
}

User.prototype.edit_action = function () {
  if (!res.handlers.context) res.handlers.context = this;

  if (req.postParams.save) {
    try {
      this.update(req.postParams);
      res.message = gettext('The changes were saved successfully.');
      res.redirect(res.handlers.context.href(req.action));
    } catch (err) {
      res.message = err.toString();
    }
  }

  session.data.token = User.getSalt();
  session.data.salt = this.salt;

  res.data.title = this.name;
  res.data.body = this.renderSkinAsString('$User#edit');
  res.handlers.site.renderSkin('Site#page');
};

User.prototype.block_action = function () {
  this.status = User.BLOCKED;
  res.redirect(req.data.http_referer);
};

User.prototype.export_action = function() {
  if (!res.handlers.context) res.handlers.context = this;

  const data = req.postParams;
  const param = {};
  const href = res.handlers.context.href(req.action);
  let job = new Admin.Job(this.job || {});

  if (data.submit === 'export') {
    try {
      if (job.method && job.method !== 'export') {
        throw Error(gettext('There is already another job queued for this account: {0}', job.method));
      }
      this.job = Admin.queue(this, 'export');
      res.message = gettext('The account is queued for export.');
    } catch (ex) {
      res.message = ex.toString();
      app.log(res.message);
    }
    res.redirect(href);
  } else if (data.submit === 'cancel') {
    this.job = job.remove();
    res.redirect(href);
  }

  if (job.method === 'export') {
    param.status = gettext('The account data will be available for download from here within the next days.');
  }

  res.data.title = 'Export Account ' + this.name;
  res.data.body = this.renderSkinAsString('$User#export', param);
  res.handlers.site.renderSkin('Site#page');
};

User.prototype.timeline_action = function() {
  if (!res.handlers.context) res.handlers.context = this;

  const collection = [];
  const sql = new Sql();
  const page = req.queryParams.page;
  const pageSize = 25;
  const offset = (req.data.page || 0) * pageSize;
  let count = 0;

  sql.retrieve("select (select count(*) from content where creator_id = $0) + (select count(*) from image where creator_id = $0) + (select count(*) from file where creator_id = $0) + (select count(*) from poll where creator_id = $0) as count", this._id);

  sql.traverse(function() {
    count = this.count;
  });

  // MySQL needs the limit parameter -> https://stackoverflow.com/questions/255517/mysql-offset-infinite-rows
  sql.retrieve("select created, id, 'Story' as prototype from content where creator_id = $0 union select created, id, 'Image' as prototype from image where creator_id = $0 union select created, id, 'File' as prototype from file where creator_id = $0 union select created, id, 'Poll' as prototype from poll where creator_id = $0 order by created desc limit $1 offset $2", this._id, pageSize, offset);

  sql.traverse(function() {
    const object = HopObject.getById(this.id, this.prototype);
    collection.push(object);
  });

  res.data.list = renderList(collection, this.renderTimelineItem, null, page);
  res.data.pager = renderPager(count, this.href(req.action), pageSize, page);
  res.data.title = gettext('Timeline');
  res.data.body = this.renderSkinAsString('$User#timeline');
  res.handlers.site.renderSkin('Site#page');
};

User.prototype.delete_action = function() {
  if (!res.handlers.context) res.handlers.context = this;
  res.data.action = res.handlers.context.href(req.action);
  if (req.postParams.proceed) {
    this.hash = String.EMPTY;
    this.status = User.DELETED;
    this.deleted = null;
    if (this.countContributions() < 1) {
      // If an account contains no content, delete it immediately
      HopObject.prototype.delete_action.call(this);
    } else {
      // Otherwise, queue for deletion
      res.message = gettext('The account {0} is being deleted.', this.name);
    }
    this.log(root, 'Deleted account ' + this.name);
    res.redirect(User.require(User.PRIVILEGED) ? res.handlers.context.href('edit') : root.href());
  } else {
    HopObject.prototype.delete_action.call(this);
  }
};

User.prototype.getConfirmText = function () {
  return gettext('You are about to delete the account {0}.', this.getTitle());
};

User.prototype.getConfirmExtra = function () {
  return this.renderSkinAsString('$User#delete');
};

User.prototype.renderTimelineItem = function(item) {
  Admin.prototype.renderActivity(item, '$Admin#timelineItem');
};

User.prototype.countContributions = function() {
  return [this.stories, this.images, this.files, this.polls, this.comments, this.votes].reduce((total, collection) => {
    return total + collection.size();
  }, 0);
};

/**
 *
 * @param {Object} data
 */
User.prototype.update = function(data) {
  if (!data.hash && data.password) {
    data.hash = (data.password + session.data.token).md5();
  }

  if (data.hash) {
    this.hash = data.hash;
    this.salt = session.data.token;
  }

  if (!(data.email = validateEmail(data.email))) {
    throw Error(gettext('Please enter a valid e-mail address'));
  }

  if (data.url && !(data.url = validateUrl(data.url))) {
    throw Error(gettext('Please enter a valid URL'));
  }

  if (this.getPermission('edit')) {
    if (this.status === User.PRIVILEGED && data.status !== User.PRIVILEGED && root.admins.count() < 2) {
      throw Error(gettext('You cannot revoke permissions from the only privileged account.'));
    }
    if (this.status === User.PRIVILEGED && data.status === User.DELETED) {
      throw Error(gettext('You cannot delete a privileged account.'));
    }

    // Remove the corresponding job if site deletion is cancelled
    if (this.job && this.status === User.DELETED && this.status !== data.status) {
      let job = new Admin.Job(this.job);
      if (job.method === 'remove') job.remove();
      this.deleted = null;
      this.created = new Date();
    }

    this.status = data.status;
    this.notes = data.notes;
  }

  this.email = data.email;
  this.url = data.url;
  if (this === session.user) this.touch();
  return this;
}

/**
 *
 */
User.prototype.touch = function() {
  this.modified = new Date;
  if (session.user) this.modifier = session.
  return;
}

/**
 *
 * @param {String} token
 * @returns {String}
 */
User.prototype.getDigest = function(token) {
  token || (token = String.EMPTY);
  return (this.hash + token).md5();
}

/**
 *
 * @param {String} name
 * @returns {Object}
 */
User.prototype.getFormOptions = function(name) {
  switch (name) {
    case 'status':
    return User.getStatus();
  }
}

/**
 * Enable <% user.email %> macro for privileged users only
 */
User.prototype.email_macro = function() {
  if (User.require(User.PRIVILEGED)) {
    res.write(this.email);
  }
  return;
}

/**
 *
 * @param {Object} param
 * @param {String} type
 */
User.prototype.list_macro = function(param, type) {
  switch (type) {
    case 'sites':
    var memberships = session.user.list();
    memberships.sort(function(a, b) {
      return b.site.modified - a.site.modified;
    });
    memberships.forEach(function(membership) {
      var site;
      if (site = membership.get('site')) {
        site.renderSkin('$Site#listItem');
      }
      return;
    });
  }
  return;
};

User.prototype.gravatar_macro = function () {
  res.write('https://secure.gravatar.com/avatar/');
  this.email && res.write(this.email.trim().toLowerCase().md5());
}
