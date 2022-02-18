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
 * @fileOverview Defines the Admin prototype.
 */

markgettext('export');
markgettext('import');
markgettext('remove');

Admin.MAXBATCHSIZE = 50;

/**
 *
 * @param {HopObject} target
 * @param {String} method
 * @param {User} user
 * @constructor
 */
Admin.Job = function(target, method, user) {
  if (!user) user = session.user;

  var file, date;

  this.__defineGetter__('target', function() {
    return target;
  });

  this.__defineGetter__('method', function() {
    return method;
  });

  this.__defineGetter__('user', function() {
    return user;
  });

  this.__defineGetter__('name', function() {
    return file.getName();
  });

  this.__defineGetter__('date', function() {
    return date;
  });

  this.remove = function(isCareless) {
    // isCareless is `true` after a site is completely removed, to prevent NullPointer exception
    if (!isCareless) target.job = null;
    if (file.exists()) file['delete']();
  };

  if (target && method && user) {
    file = new java.io.File.createTempFile('job-', String.EMPTY, Admin.queue.dir);
    serialize({type: target._prototype, id: target._id, method: method, user: user._id}, file);
  } else if (target) {
    file = new java.io.File(Admin.queue.dir, target);
    if (file.exists()) {
      var data = deserialize(file);
      target = global[data.type].getById(data.id);
      method = data.method;
      user = User.getById(data.user);
      date = new Date(file.lastModified());
    }
  } else {
    throw Error('Insufficient arguments');
  }

  this.toString = function() {
    return ['[Job: ', method, ' ', target, ' by ', user, ']'].join(String.EMPTY);
  }

  return this;
}

/**
 * @function
 * @returns {String[]}
 * @see defineConstants
 */
Admin.getNotificationScopes = defineConstants(Admin, markgettext('None'), markgettext('Trusted'), markgettext('Regular'));

/**
 * @function
 * @return {String[]}
 * @see defineConstants
 */
Admin.getPhaseOutModes = defineConstants(Admin, markgettext('Disabled'), markgettext('Restricted'), markgettext('Abandoned'), markgettext('Both'));

/**
 * @function
 * @returns {String[]}
 * @see defineConstants
 */
Admin.getCreationScopes = defineConstants(Admin, markgettext('Privileged'), markgettext('Trusted'), markgettext('Regular'));

/**
 * @function
 * @returns {String[]}
 * @see defineConstants
 */
Admin.getLoginScopes = defineConstants(Admin, markgettext('Privileged'), markgettext('Trusted'), markgettext('Regular'), markgettext('None'));

/**
 * Convenience method for easily queueing jobs.
 * @param {HopObject} target
 * @param {String} method
 * @param {User} user
 * @returns {String}
 * @see Admin.Job
 */
Admin.queue = function(target, method, user) {
  var job = new Admin.Job(target, method, user || session.user);
  return job.name;
}

/**
 *
 */
Admin.queue.dir = (new java.io.File(app.dir, '../jobs')).getCanonicalFile();
Admin.queue.dir.exists() || Admin.queue.dir.mkdirs();

/**
 *
 */
Admin.dequeue = function() {
  var jobs = Admin.getJobs('desc');
  var max = Math.min(jobs.length, Admin.MAXBATCHSIZE);
  for (let i=0; i<max; i+=1) {
    let job = new Admin.Job(jobs[i].name);
    if (job.target) {
      try {
        app.log('Processing queued job ' + (i + 1) + ' of ' + max);
        switch (job.method) {
          case 'remove':
          if (job.target.constructor === Site) Site.remove.call(job.target);
          if (job.target.constructor === User) User.remove.call(job.target);
          break;
          case 'import':
          Importer.run(job.target, job.user);
          break;
          case 'export':
          Exporter.run(job.target, job.user);
          break;
        }
        job.remove(true);
      } catch (ex) {
        app.log('Failed to process job ' + job + ' due to ' + ex);
        app.debug(ex.rhinoException);
      }
    }
  }
  return;
}

Admin.getJobs = function(sort) {
  if (!sort) sort = 'asc';
  return Admin.queue.dir.listFiles().sort((a, b) => {
    return (a.lastModified() - b.lastModified()) * (sort === 'asc' ? -1 : 1);
  });
};

Admin.purgeAccounts = function() {
  var now = Date.now();

  root.admin.deletedUsers.forEach(function() {
    if (this.job || this.deleted) return; // already gone
    this.job = Admin.queue(this, 'remove', this);
  });
};

Admin.purgeSites = function() {
  var now = new Date;

  root.admin.deletedSites.forEach(function() {
    if (this.job) return;
    this.job = Admin.queue(this, 'remove', this.modifier);
  });

  var notificationPeriod = root.phaseOutNotificationPeriod * Date.ONEDAY;
  var gracePeriod = root.phaseOutGracePeriod * Date.ONEDAY;

  var phaseOutAbandonedSites = function() {
    root.forEach(function() {
      if (this.status === Site.TRUSTED) {
        return;
      }
      var age = now - (this.stories.size() > 0 ?
          this.stories.get(0).modified : this.modified);
      if (age - notificationPeriod > 0) {
        if (!this.notified) {
          var site = res.handlers.site = this;
          this.members.owners.forEach(function() {
            res.handlers.membership = this;
            sendMail(this.creator.email,
                gettext('[{0}] Warning: Site will be deleted'),
                site.renderSkinAsString('$Site#notify_delete'));
          });
          this.notified = now;
        } else if (now - this.notified > gracePeriod) {
          this.status = Site.DELETED;
          this.deleted = now;
          this.notified = null;
        }
      }
    });
    return;
  }

  var phaseOutRestrictedSites = function() {
    root.admin.restrictedSites.forEach(function() {
      if (this.status === Site.TRUSTED) {
        return;
      }
      var age = now - this.created;
      if (age - notificationPeriod > 0) {
        if (!this.notified) {
          var site = res.handlers.site = this;
          this.members.owners.forEach(function() {
            res.handlers.membership = this;
            sendMail(this.creator.email,
                gettext('[{0}] Warning: Site will be blocked'),
                site.renderSkinAsString('$Site#notify_block'));
          });
          this.notified = now;
        } else if (now - this.notified > gracePeriod) {
          this.status = Site.BLOCKED;
          this.notified = null;
        }
      }
    });
    return;
  }

  switch (root.phaseOutMode) {
    case Admin.ABANDONED:
    return phaseOutAbandonedSites();
    case Admin.RESTRICTED:
    return phaseOutRestrictedSites();
    case Admin.BOTH:
    phaseOutAbandonedSites();
    return phaseOutRestrictedSites();
  }
  return;
}

/**
 *
 */
Admin.purgeReferrers = function() {
  var sql = new Sql;
  var result = sql.execute(Sql.PURGEREFERRERS);
  return result;
}

/**
 *
 */
Admin.commitRequests = function() {
  var requests = app.data.requests;
  app.data.requests = {};
  for each (var item in requests) {
    switch (item.type) {
      case Story:
      var story = Story.getById(item.id);
      story && (story.requests = item.requests);
      break;
    }
  }
  res.commit();
  return;
}

/**
 *
 */
Admin.commitEntries = function() {
  var entries = app.data.entries;
  app.data.entries = [];
  var history = [];

  for each (var item in entries) {
    var referrer = helma.Http.evalUrl(item.referrer);
    if (!referrer) {
      continue;
    }

    // Only log unique combinations of context, ip and referrer
    referrer = Admin.resolveUrl(referrer);
    var key = item.context._prototype + '-' + item.context._id + ':' +
        item.ip + ':' + referrer;
    if (history.indexOf(key) > -1) {
      continue;
    }
    history.push(key);
    item.referrer = referrer;

    // Exclude requests coming from the same site
    if (item.site) {
      var href = item.site.href().toLowerCase();
      if (href.startsWith('http') &&
          referrer.toLowerCase().contains(href.substr(0, href.length-1))) {
        continue;
      }
    }
    item.persist();
  }

  res.commit();
  return;
}

/**
 *
 */
Admin.invokeCallbacks = function() {
  var http = helma.Http();
  http.setTimeout(200);
  http.setReadTimeout(300);
  http.setMethod('POST');

  var ref, site, item;
  while (ref = app.data.callbacks.pop()) {
    site = Site.getById(ref.site);
    item = ref.handler && ref.handler.getById(ref.id);
    if (!site || !item) {
      continue;
    }
    app.log('Invoking callback URL ' + site.callbackUrl + ' for ' + item);
    try {
      http.setContent({
        type: item.constructor.name,
        id: item.name || item._id,
        url: item.href(),
        date: item.modified.valueOf(),
        user: item.modifier.name,
        site: site.title || site.name,
        origin: site.href()
      });
      http.getUrl(site.callbackUrl);
    } catch (ex) {
      app.debug('Invoking callback URL ' + site.callbackUrl + ' failed: ' + ex);
    }
  }
  return;
}

/**
 *
 */
Admin.updateHealth = function() {
  var health = Admin.health || {};
  if (!health.modified || new Date - health.modified > 5 * Date.ONEMINUTE) {
    health.modified = new Date;
    health.requestsPerUnit = app.requestCount - (health.currentRequestCount || 0);
    health.currentRequestCount = app.requestCount;
    health.errorsPerUnit = app.errorCount - (health.currentErrorCount || 0);
    health.currentErrorCount = app.errorCount;
    Admin.health = health;
  }
  return;
}

/**
 *
 */
Admin.updateDomains = function() {
  res.push();
  for (var key in app.properties) {
    if (key.startsWith('domain.') && !key.endsWith('*')) {
      res.writeln(getProperty(key) + '\t\t' + key.substr(7));
    }
  }
  var map = res.pop();
  var file = new java.io.File(app.appsProperties.static, 'domains.map');
  var out = new java.io.BufferedWriter(new java.io.OutputStreamWriter(
      new java.io.FileOutputStream(file), 'UTF-8'));
  out.write(map);
  out.close();
  return;
}

Admin.resolveUrl = function(url) {
  var http = new helma.Http();
  http.setMethod('HEAD');
  http.setFollowRedirects(false);

  var response;
  var location = url;

  while (location) {
    try {
      response = http.getUrl(location);
      location = response.location;
    } catch (error) {
      location = null;
    }
  };

  return String(response ? response.url : url);
};

/**
 * The Admin prototype is mounted at root and provides actions needed
 * for system administration. A user needs the User.PRIVILEGED permission
 * to gain access or modify settings.
 * @name Admin
 * @constructor
 * @property {Sites[]} deletedSites Contains sites scheduled for deletion
 * @property {LogEntry[]} entries Contains administrative log entries only
 * @property {Sites[]} restrictedSites Contains sites which are restricted but not blocked
 * @property {Sites[]} sites Contains all available sites
 * @property {Users[]} users Contains all available users
 * @extends HopObject
 */
Admin.prototype.constructor = function() {
  this.filterSites();
  this.filterUsers();
  return this;
}

/**
 *
 * @param {Object} action
 * @returns {Boolean}
 */
Admin.prototype.getPermission = function(action) {
  return User.require(User.PRIVILEGED);
}

/**
 *
 */
Admin.prototype.onRequest = function() {
  HopObject.prototype.onRequest.apply(this);
  if (!session.data.admin) {
    session.data.admin = new Admin();
  }
  return;
}

/**
 *
 * @param {String} name
 */
Admin.prototype.onUnhandledMacro = function(name) {
  console.warn('Add ' + name + '_macro to Admin!');
  return null;
}

Admin.prototype.main_action = function() {
  if (req.postParams.save) {
    try {
      this.update(req.postParams);
      this.log(root, 'setup');
      res.message = gettext('Successfully updated the setup.');
      res.redirect(this.href(req.action));
    } catch (ex) {
      res.message = ex;
      app.log(ex);
    }
  }

  res.data.title = gettext('Setup');
  res.data.action = this.href(req.action);
  res.data.body = this.renderSkinAsString('$Admin#setup');
  root.renderSkin('Site#page');
  return;
}

Admin.prototype.activity_action = function () {
  if (req.isPost()) {
    session.data.display = req.postParams.display;
    session.data.order = req.postParams.order;
    session.data.filter = req.postParams.filter;
  } else if (!req.data.page) {
    session.data.display = session.data.order = session.data.filter = null;
  }

  var constraints = {order: 'created desc', limit: 1000};
  var sites = Site.getCollection(constraints);
  var stories = Story.getCollection(constraints);
  var comments = Comment.getCollection(constraints);
  var images = Image.getCollection(constraints);
  var files = File.getCollection(constraints);
  var polls = Poll.getCollection(constraints);
  var users = User.getCollection(constraints);

  var displays = {
    1: [stories, images, files, polls],
    2: [comments],
    3: [stories, comments],
    4: [files],
    5: [images],
    6: [polls],
    7: [sites],
    8: [users]
  };

  var lists = displays[session.data.display] || [sites, stories, images, files, polls, users];
  lists = lists.map(function (collection) {
    return collection.list();
  });

  var union = Array.prototype.concat.apply([], lists);
  union.sort(new Number.Sorter('created', Number.Sorter.DESC));
  (session.data.order == 1) && union.reverse();

  if (session.data.filter) {
    var filter = '^' + session.data.filter.replace(/(\W\D[*])/g, '$1').replace(/\*/g, '.*') + '$';
    var re = new RegExp(filter.toLowerCase());
    union = union.filter(function (item) {
      return re.test((item.creator ? item.creator.name : item.name).toLowerCase());
    });
  }

  if (session.data.display == 3 /* link activity */) {
    union = union.filter(function (item) {
      return getLinkCount(item) > 0;
    });
  }

  res.data.count = union.length;
  res.data.list = renderList(union, this.renderActivity, 25, req.queryParams.page);
  res.data.pager = renderPager(union, this.href(req.action), 25, req.queryParams.page);
  res.data.title = gettext('Activity');
  res.data.action = this.href(req.action);
  res.data.body = this.renderSkinAsString('$Admin#activities');
  root.renderSkin('Site#page');
  return;
}

Admin.prototype.jobs_action = function() {
  var files = Admin.getJobs();
  res.data.count = files.length;
  res.data.list = renderList(files, this.renderItem);
  res.data.title = gettext('Jobs');
  res.data.action = this.href(req.action);
  res.data.body = this.renderSkinAsString('$Admin#jobs');
  root.renderSkin('Site#page');
  return;
};

Admin.prototype.job_action = function () {
  if (req.data.name) {
    const job = new Admin.Job(req.data.name);
    job.remove();
  }
  return res.redirect(req.data.http_referer);
};

Admin.prototype.sites_action = function() {
  if (req.isPost()) {
    session.data.display = req.postParams.display;
    session.data.sorting = req.postParams.sorting;
    session.data.order = req.postParams.order;
    session.data.filter = req.postParams.filter;
  } else if (!req.data.page) {
    session.data.display = session.data.sorting = session.data.order = session.data.filter = null;
  }
  session.data.admin.filterSites(session.data);
  res.data.count = session.data.admin.sites.size();
  res.data.list = renderList(session.data.admin.sites, this.renderItem, 25, req.queryParams.page);
  res.data.pager = renderPager(session.data.admin.sites, this.href(req.action), 25, req.data.page);
  res.data.title = gettext('Sites');
  res.data.action = this.href(req.action);
  res.data.body = this.renderSkinAsString('$Admin#sites');
  root.renderSkin('Site#page');
  return;
}

Admin.prototype.users_action = function() {
  if (req.isPost()) {
    session.data.display = req.postParams.display;
    session.data.sorting = req.postParams.sorting;
    session.data.order = req.postParams.order;
    session.data.filter = req.postParams.filter;
  } else if (!req.data.page) {
    session.data.display = session.data.sorting = session.data.order = session.data.filter = null;
  }
  session.data.admin.filterUsers(session.data);
  res.data.count = session.data.admin.users.size();
  res.data.list = renderList(session.data.admin.users, this.renderItem, 25, req.data.page);
  res.data.pager = renderPager(session.data.admin.users, this.href(req.action), 25, req.data.page);
  res.data.title = gettext('Accounts');
  res.data.action = this.href(req.action);
  res.data.body = this.renderSkinAsString('$Admin#users');
  root.renderSkin('Site#page');
  return;
}

/**
 *
 * @param {Object} data
 */
Admin.prototype.update = function(data) {
  root.map({
    creationScope: data.creationScope,
    creationDelay: data.creationDelay,
    loginScope: data.loginScope,
    notificationScope: data.notificationScope,
    phaseOutGracePeriod: data.phaseOutGracePeriod,
    phaseOutMode: data.phaseOutMode,
    phaseOutNotificationPeriod: data.phaseOutNotificationPeriod,
    privacyStory: data.privacyStory,
    probationPeriod: data.probationPeriod,
    quota: data.quota,
    replyTo: data.replyTo,
    termsStory: data.termsStory
  });
  return;
}

/**
 *
 * @param {Object} data
 */
Admin.prototype.filterSites = function(data) {
  data || (data = {});

  var displays = {
    1: "status = 'blocked'",
    2: "status = 'deleted'",
    3: "status = 'trusted'",
    4: "mode = 'open'",
    5: "mode = 'restricted'",
    6: "mode = 'public'",
    7: "mode = 'closed'"
  };

  var sortings = {
    1: 'created',
    2: 'name'
  };

  var sql = ['where'];
  add(displays[data.display] || true);

  if (data.filter) {
    var parts = stripTags(data.filter).split(String.SPACE);
    var keyword, like;
    for (var i in parts) {
      keyword = parts[i].replace(/\*/g, '%');
      like = keyword.contains('%') ? 'like' : '=';
      add(i < 1 ? 'and' : 'or', 'name', like, quote(keyword));
    }
  }

  add('order by', sortings[data.sorting] || 'modified', data.order === '1' ? 'asc' : 'desc');
  this.sites.subnodeRelation = sql.join(String.SPACE);

  function add() {
    sql.push.apply(sql, arguments);
  }
}

/**
 *
 * @param {Object} data
 */
Admin.prototype.filterUsers = function(data) {
  data || (data = {});

  var displays = {
    1: "status = 'deleted'",
    2: "status = 'blocked'",
    3: "status = 'trusted'",
    4: "status = 'privileged'"
  };

  var sortings = {
    1: 'modified',
    2: 'name'
  };

  var sql = ['where'];
  add(displays[data.display] || true);

  if (data.filter) {
    var parts = stripTags(data.filter).split(String.SPACE);
    var keyword, like;
    for (var i in parts) {
      add(i < 1 ? 'and' : 'or');
      keyword = parts[i].replace(/\*/g, '%');
      like = keyword.contains('%') ? 'like' : '=';
      if (keyword.contains('@')) {
        add('email');
        keyword = keyword.replace(/@/g, '');
      } else {
        add('name');
      }
      add(like, quote(keyword));
    }
  }

  add('order by', sortings[data.sorting] || 'created', data.order === '1' ? 'asc' : 'desc');
  this.users.subnodeRelation = sql.join(String.SPACE);

  function add() {
    sql.push.apply(sql, arguments);
  }
}

/**
 *
 * @param {HopObject} item
 */
Admin.prototype.renderItem = function(item) {
  res.handlers.item = item;
  var name = item._prototype;
  if (item.getClass && item.getClass() === java.io.File) {
      name = 'Job';
      res.handlers.item = new Admin.Job(item.name);
  } else if (name === 'Root') {
    name = 'Site';
  }
  Admin.prototype.renderSkin('$Admin#' + name.toLowerCase());
  return;
}

Admin.prototype.renderActivity = function (item, skin) {
  if (!skin) skin = '$Admin#activity';

  var param = {
    item: item,
    icon: getIcon(item),
    date: item.created,
    reference: getReference(item),
    user: item.creator ? item.creator.name : item.name,
    href: item.href(item.constructor === User ? 'edit' : ''),
    linkCount: getLinkCount(item),
    alert: getAlert(item),
    site: (item.parent && item.parent.site || item.parent || item.site || {}).name
  };

  param.warn = param.linkCount > 2 ? true : false;

  Admin.prototype.renderSkin(skin, param);

  function getReference(item) {
    switch (item.constructor) {
      case Root:
      case Site:
      return item.getTitle();
      case Comment:
      case Story:
      return item.getAbstract();
      case File:
      return item.name;
      case User:
      return item.email
      case Image:
      res.push();
      item.thumbnail_macro({'class': 'uk-thumbnail'}, 'thumbnail');
      return res.pop();
      case Poll:
      return item.question;
    }
  }

  function getIcon(item) {
    var name;
    switch (item.constructor) {
      case Root:
      case Site:
      res.push();
      html.element('i', String.EMPTY, {'class': 'av-ant'});
      return res.pop();
      case Comment:
      name = 'comment-o';
      break;
      case Story:
      name = 'newspaper-o';
      break
      case File:
      name = 'file-o';
      break;
      case Image:
      name = 'image';
      break;
      case User:
      name = 'user';
      break;
      case Poll:
      name = 'bar-chart';
      break;
    }
    return "<i class='uk-icon uk-icon-" + name + "'></i>";
  }

  function getAlert(item) {
    switch (item.constructor) {
      case User:
      return item.status !== User.BLOCKED && item.status !== User.DELETED && item.created - item.modified < 1;
      case Site:
      return item.status !== Site.DELETED && item.created - item.modified < 1;
    }
    return false;
  }
};

/**
 *
 * @param {HopObject} context
 * @param {String} action
 */
Admin.prototype.log = function(context, action) {
  var entry = new LogEntry(context, action);
  this.entries.add(entry);
  return;
}

/**
 *
 * @param {Object} param
 * @param {String} action
 * @param {Number} id
 * @param {String} text
 */

Admin.prototype.href_macro = function (param, action, id) {
  res.write(this.href.call(this, action, id));
  return;
};

Admin.prototype.href = function (action, id) {
  switch (action) {
    case 'main':
    action = '.';
    break;
  }
  return root.href('admin') + '/' + action;
};

/**
 *
 * @param {Object} param
 * @param {String} name
 */
Admin.prototype.skin_macro = function(param, name) {
  if (this.getPermission('main')) {
    return HopObject.prototype.skin_macro.apply(this, arguments);
  }
  return;
}

/**
 *
 * @param {Object} param
 * @param {HopObject} object
 * @param {String} name
 */
Admin.prototype.items_macro = function(param, object, name) {
  if (!object || !object.size) {
    return;
  }
  var max = Math.min(object.size(), parseInt(param.limit) || 10);
  for (var i=0; i<max; i+=1) {
    html.link({href: object.get(i).href()}, '#' + (object.size()-i) + ' ');
  }
  return;
}

/**
 *
 * @param {Object} param
 */
Admin.prototype.dropdown_macro = function(param /*, value1, value2, ... */) {
  if (!param.name || arguments.length < 2) {
    return;
  }
  var values = Array.prototype.slice.call(arguments, 1);
  var options = values.map(function(item, index) {
    return {
      value: index,
      display: gettext(item)
    }
  });
  var selectedIndex = req.postParams[param.name] || session.data[param.name];
  html.dropDown({name: param.name}, options, selectedIndex);
  return;
}

Admin.prototype.link_macro = function (param, action, text, target) {
  if (target) {
    switch (action) {
      case 'block':
      var user = target.creator || target;
      if (user.status !== User.PRIVILEGED && user.status !== User.BLOCKED && user.status !== User.DELETED) {
        var url = user.href('block');
        return renderLink.call(global, param, url, text || String.EMPTY, this);
      }
      break;

      case 'delete':
      var site = target.constructor === Site ? target : target.site;
      if (site && site.getPermission(action) && site.status !== Site.DELETED) {
        var url = site.href('delete') + '?safemode';
        return renderLink.call(global, param, url, text || String.EMPTY, this);
      }
      break;
    }
    return;
  }
  return HopObject.prototype.link_macro.call(this, param, action, text);
};
