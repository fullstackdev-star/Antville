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
 * @fileOverview Defines the Layout prototype
 */

markgettext('Layout');
markgettext('layout');
markgettext('a layout');

/** @constant */
Layout.VALUES = [
  'background color',
  'link color',
  'active link color',
  'visited link color',
  'big font',
  'big font size',
  'big font color',
  'base font',
  'base font size',
  'base font color',
  'small font',
  'small font size',
  'small font color'
];

/**
 * @param {Site} site
 * @param {User} user
 * @returns {Layout}
 */
Layout.add = function(site, user) {
  HopObject.confirmConstructor(Layout);
  var layout = new Layout;
  layout.site = site;
  layout.creator = user || session.user;
  layout.created = new Date;
  layout.mode = Layout.DEFAULT;
  layout.reset();
  layout.touch();
  site.layout = layout;
  return layout
}

/**
 *
 * @param {Layout} layout
 * @param {Boolean} includeSelf
 */
Layout.remove = function(options) {
  if (!options) options = {};
  if (this.constructor === Layout) {
    // The “force” flag is set e.g. when a whole site is removed
    if (!options.force) {
      // Backup current layout in temporary directory if possible
      var dir = this.getFile();
      if (dir.exists() && dir.list().length > 0) {
        var zip = this.getArchive(res.skinpath);
        var file = java.io.File.createTempFile(this.site.name + '-layout-', '.zip');
        zip.save(file);
      }
    }
    HopObject.remove.call(this.skins);
    HopObject.remove.call(this.images);
    this.getFile().removeDirectory();
    if (options.force) {
      this.deleteMetadata();
      this.remove();
    }
  }
  return;
};

/**
 * @function
 * @param {Boolean} [value]
 * @returns {Boolean}
 */
Layout.sandbox = function(value) {
  var cookie = User.COOKIE + 'LayoutSandbox';
  if (typeof value === 'undefined') {
    return req.cookies[cookie] === 'true';
  }
  if (value === true) {
    res.setCookie(cookie, true);
  } else if (value === false) {
    res.unsetCookie(cookie);
  }
  return value;
}

/**
 * @function
 * @returns {String[]}
 * @see defineConstants
 */
Layout.getModes = defineConstants(Layout, 'default', 'shared');

this.handleMetadata('origin');
this.handleMetadata('originator');
this.handleMetadata('originated');

/**
 * @name Layout
 * @constructor
 * @property {Date} created
 * @property {User} creator
 * @property {Images} images
 * @property {Metadata} metadata
 * @property {String} mode
 * @property {Date} modified
 * @property {User} modifier
 * @property {String} origin
 * @property {String} originator
 * @property {Date} originated
 * @property {Site} site
 * @property {Skins} skins
 * @extends HopObject
 */
Layout.prototype.constructor = function() {
  HopObject.confirmConstructor.call(this);
  return this;
}

/**
 *
 * @param {String} action
 * @returns {Boolean}
 */
Layout.prototype.getPermission = function(action) {
  switch (action) {
    case '.':
    case 'main':
    case 'export':
    case 'images':
    case 'import':
    case 'reset':
    case 'skins':
    case 'sandbox':
    return res.handlers.site.getPermission('main') &&
        Membership.require(Membership.OWNER) ||
        User.require(User.PRIVILEGED);
  }
  return false;
}

// FIXME: The Layout.href method is overwritten to guarantee that
// URLs won't contain the layout ID instead of 'layout'
/**
 *
 * @param {String} action
 * @returns {String}
 */
Layout.prototype.href = function(action) {
  res.push();
  res.write(res.handlers.site.href());
  res.write('layout/');
  action && res.write(action);
  return res.pop();
}

Layout.prototype.main_action = function() {
  if (req.postParams.save) {
    try {
      this.update(req.postParams);
      res.message = gettext('Successfully updated the layout.');
      res.redirect(this.href());
    } catch (ex) {
      res.message = ex;
      app.log(ex);
    }
  }
  res.data.title = gettext('Layout');
  res.data.body = this.renderSkinAsString('$Layout#main');
  res.handlers.site.renderSkin('Site#page');
  return;
}

/**
 *
 * @param {String} name
 * @returns {Object}
 */
Layout.prototype.getFormOptions = function(name) {
  switch (name) {
    case 'mode':
    return Layout.getModes();
    case 'parent':
    return this.getParentOptions();
  }
}

/**
 *
 * @param {Object} data
 */
Layout.prototype.update = function(data) {
  var skin = this.skins.getSkin('Site', 'values');
  if (!skin) {
    Skin.add('Site', 'values', this);
  }
  res.push();
  for (var key in data) {
    var prefix = 'av-value ';
    if (key.startsWith(prefix)) {
      var value = data[key];
      key = key.substr(prefix.length);
      res.write('<% value ');
      res.write(quote(key, '\\s'));
      res.write(String.SPACE);
      res.write(quote(value, '\\s'));
      res.write(' %>\n');
    }
  }
  res.write('\n');
  skin.setSource(res.pop());
  Layout.sandbox(!!data.sandbox);
  this.description = data.description;
  this.mode = data.mode;
  this.touch();
  return;
}

Layout.prototype.reset_action = function() {
  if (req.data.proceed) {
    try {
      Layout.remove.call(this);
      this.reset();
      res.message = gettext('{0} was successfully reset.', gettext('Layout'));
      res.redirect(this.href());
    } catch(ex) {
      res.message = ex;
      app.log(ex);
    }
  }

  session.data.location = this.href();
  res.data.action = this.href(req.action);
  res.data.title = gettext('Confirm Reset');
  res.data.body = this.renderSkinAsString('$HopObject#confirm', {
    text: this.getConfirmText()
  });
  res.handlers.site.renderSkin('Site#page');
}

Layout.prototype.export_action = function() {
  res.contentType = 'application/zip';
  var zip = this.getArchive(res.skinpath);
  res.setHeader('Content-Disposition',
      'attachment; filename=' + this.site.name + '-layout.zip');
  res.writeBinary(zip.getData());
  return;
}

Layout.prototype.import_action = function() {
  var layout = this;
  var data = req.postParams;
  if (data.submit) {
    try {
      if (!data.upload || data.upload.contentLength === 0) {
        throw Error(gettext('Please upload a zipped layout archive'));
      }
      // Remove current layout
      Layout.remove.call(this);
      // Extract zipped layout
      var baseDir = this.site.getStaticFile();
      var layoutDir = this.getFile();
      var fname = data.upload.writeToFile(baseDir);
      var zipFile = new helma.File(baseDir, fname);
      var zip = new helma.Zip(zipFile);
      zip.extractAll(layoutDir);
      zipFile.remove();
      // Read data file
      var data = Xml.read(new helma.File(layoutDir, 'data.xml'));
      if (!data.version) {
        throw Error(gettext('Sorry, this layout is not compatible with Antville.'));
      }
      // Begin import
      this.origin = data.origin;
      this.originator = data.originator;
      this.originated = data.originated;
      data.images.forEach(function() {
        var content = new helma.File(layoutDir, this.fileName);
        this.file_origin = data.origin;
        this.file = Packages.helma.util.MimePart(this.name, content.toByteArray(), this.contentType);
        Image.add(this, layout);
      });
      this.touch();
      res.message = gettext('The layout was successfully imported.');
    } catch (ex) {
      res.message = ex;
      app.log(ex);
    }
    res.redirect(this.href(req.action));
  }
  res.data.title = gettext('Import Layout');
  res.data.body = this.renderSkinAsString('$Layout#import');
  res.handlers.site.renderSkin('Site#page');
  return;
}

/**
 *
 * @param {String} name
 * @param {String} fallback
 * @returns {Image}
 */
Layout.prototype.getImage = function(name, fallback) {
  var layout = this;
  while (layout) {
    layout.images.prefetchChildren();
    if (layout.images.get(name)) {
      return layout.images.get(name);
    }
    if (fallback && layout.images.get(fallback)) {
      return layout.images.get(fallback);
    }
    layout = layout.parent;
  }
  return null;
}

/**
 *
 * @param {String} name
 * @returns {helma.File}
 */
Layout.prototype.getFile = function(name) {
  name || (name = String.EMPTY);
  return this.site.getStaticFile('layout/' + name);
}

/**
 * @returns {String[]}
 */
Layout.prototype.getSkinPath = function() {
  if (!this.site) {
    return null;
  }
  var skinPath = [this.getFile().toString()];
  return skinPath;
}

/**
 *
 */
Layout.prototype.reset = function() {
  var skinFiles = app.getSkinfilesInPath([app.dir]);
  var content, dir, file;
  for (var name in skinFiles) {
    if (content = skinFiles[name][name]) {
      dir = this.getFile(name);
      file = new helma.File(dir, name + '.skin');
      dir.makeDirectory();
      file.open();
      file.write(content);
      file.close();
    }
  }

  // FIXME: Reset the Site skin of root separately
  content = skinFiles.Root.Site;
  file = new helma.File(this.getFile('Root'), 'Site.skin');
  dir.makeDirectory();
  file.open();
  file.write(content);
  file.close()

  this.touch();
  return;
}

/**
 *
 * @param {String} skinPath
 * @returns {helma.Zip}
 */
Layout.prototype.getArchive = function(skinPath) {
  var zip = new helma.Zip();
  var skinFiles = app.getSkinfilesInPath(skinPath);
  for (var name in skinFiles) {
    if (skinFiles[name][name]) {
      var file = new helma.File(this.getFile(name), name + '.skin');
      if (file.exists()) {
        zip.add(file, name);
      }
    }
  }

  // FIXME: Add the Site skin of root separately
  file = new helma.File(this.getFile('Root'), 'Site.skin');
  file.exists() && zip.add(file, 'Root');

  var data = new HopObject;
  data.images = new HopObject;
  this.images.forEach(function() {
    zip.add(this.getFile());
    try {
      zip.add(this.getThumbnailFile());
    } catch (ex) {
      /* Most likely the thumbnail file is identical to the image */
    }
    var image = new HopObject;
    for each (var key in Image.KEYS) {
      image[key] = this[key];
      data.images.add(image);
    }
  });

  data.version = Root.VERSION.toString();
  data.origin = this.origin || this.site.href();
  data.originator = this.originator || session.user.name;
  data.originated = this.originated || new Date;

  // FIXME: XML encoder is losing all mixed-case properties :(
  var xml = new java.lang.String(Xml.writeToString(data));
  zip.addData(xml.getBytes('UTF-8'), 'data.xml');
  zip.close();
  return zip;
}


/**
 * @returns {String}
 */
Layout.prototype.getConfirmText = function() {
  return gettext('You are about to reset the layout of site {0}.',
      this.site.name);
}
/**
 *
 * @param {String} name
 * @returns {HopObject}
 */
Layout.prototype.getMacroHandler = function(name) {
  switch (name) {
    case 'skins':
    return this[name];

    default:
    return null;
  }
}

/**
 *
 * @param {Object} param
 * @param {String} name
 * @param {String} mode
 */
Layout.prototype.image_macro = function(param, name, mode) {
  name || (name = param.name);
  if (!name) {
    return;
  }

  var image = this.getImage(name, param.fallback);
  if (!image) {
    return;
  }

  mode || (mode = param.as);
  var action = param.linkto;
  delete(param.name);
  delete(param.as);
  delete(param.linkto);

  switch (mode) {
    case 'url' :
    return res.write(image.getUrl());
    case 'thumbnail' :
    action || (action = image.getUrl());
    return image.thumbnail_macro(param);
  }
  image.render_macro(param);
  return;
}

/**
 *
 */
Layout.prototype.values_macro = function() {
  var values = [];
  for (var key in res.meta.values) {
    values.push({
      key: key,
      value: res.meta.values[key]
    });
  }

  this.renderSkin('$Layout#value', {'class': 'uk-hidden'});

  values.sort(new String.Sorter('key'));
  for each (var pair in values) {
    var type = getType(pair.key);
    this.renderSkin('$Layout#value', {
      title: pair.key.capitalize(),
      name: 'av-value ' + pair.key,
      value: getValue(pair.value, type),
      type: type,
      macro: '<% value ' + quote(pair.key, '\\s') + ' %>'
    });
  }

  function getValue(value, type) {
    return {
      color: getColor(value)
    }[type] || value;
  }

  function getType(name) {
    var parts = name.split(String.SPACE);
    var typePart = parts.pop();
    var types = {
      color: 'color'
    };
    return types[typePart] || 'text';
  }

  function getColor(value) {
    value = String(value).trim();
    if (value.startsWith('#') && value.length === 4) {
      var color = ['#'];
      for (var i = 1, char; i < value.length; i += 1) {
        char = value[i];
        color.push(char, char);
      }
      return color.join(String.EMPTY);
    }
    return value;
  }
  return;
}

/**
 *
 */
Layout.prototype.sandbox_macro = function() {
  res.write(Layout.sandbox());
  return;
}

