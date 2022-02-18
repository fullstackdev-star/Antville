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

app.addRepository("modules/helma/Aspects.js");

var aspects = {
  setTopics: function(args, func, obj) {
    // We must clone the request parameters because only req.data is mutable.
    // (See req.params, req.postParams etc.)
    var param = Object.prototype.clone.call(args[0], {});
    var topic = param.topic || param.addToTopic;
    if (!param.tags && topic) {
      param.tags = [topic];
    }
    args[0] = param;
    return args;
  },

  fixMacroParams: function(args) {
    var param = args[0];
    var id = args[1] || param.name || param.id;
    var mode = args[2] || param.as;
    var url = param.linkto;
    !param.skin && (param.skin = param.useskin);
    delete(param.name);
    delete(param.as);
    delete(param.linkto);
    return [param, id, mode, url];
  },

  fixStoryEditorParams: function(args, func, story) {
    var data = req.postParams;
    // data.save === '1' means we are compatible already
    if (req.isPost() && data.save !== '1') {
      if (data.save) {
        data.status = Story.CLOSED;
      } else {
        var status = [Story.PUBLIC, Story.SHARED, Story.OPEN];
        data.status = status[data.editableby] || data.editableby || Story.PUBLIC;
      }
      data.mode = (data.addToFront || data.publish ? Story.FEATURED : Story.HIDDEN);
      data.commentMode = (data.discussions ? Story.OPEN : Story.CLOSED);
      data.addToFront = data.discussions = data.editableby = data.publish = null;
      data.save = 1;
    }
    return args;
  },

  fixPager: function(args, func, obj) {
    var archive = res.handlers.day = obj.archive || obj;
    res.push();
    archive.stories_macro();
    res.data.storylist = res.pop();
    res.push();
    archive.link_macro({}, "previous", gettext("Previous page"));
    res.data.prevpage = res.pop();
    res.push();
    archive.link_macro({}, "next", gettext("Next page"));
    res.data.nextpage = res.pop();
    return args;
  }
}

helma.aspects.addAround(global, "image_macro", function(args, func) {
  args = aspects.fixMacroParams(args);
  var url = args[3];
  url && res.push();
  func.apply(global, args);
  url && res.write(link_filter(res.pop(), {}, url));
  return;
});

helma.aspects.addAround(global, "poll_macro", function(args, func) {
  return func.apply(global, aspects.fixMacroParams(args));
});

helma.aspects.addAround(global, "file_macro", function(args, func) {
  return func.apply(global, aspects.fixMacroParams(args));
});

helma.aspects.addBefore(global, "story_macro", function(args, func) {
  args = aspects.fixMacroParams(args);
  if (args[0].skin == "display") {
    args[0].skin = "content";
  }
  return args;
});

(function() {
  var func;
  if (HopObject.prototype.onCodeUpdate) {
    // There are HopObject aspects already in the main code
    func = HopObject.prototype.onCodeUpdate;
  }
  HopObject.prototype.onCodeUpdate = function() {
    func && func.call(this); // Call the aspects in main code
    helma.aspects.addAfter(this, "onRequest", function(args, func, obj) {
      res.handlers.members = res.handlers.site.members;
      res.handlers.membermgr = res.handlers.site.members;
      return args;
    });
    helma.aspects.addBefore(this, "skin_macro", function(args, func, obj) {
      param = args[0];
      return [param, args[1] || param.name];
    });
    helma.aspects.addBefore(this, "link_macro", function(args, func, obj) {
      var url, text;
      var param = args[0];
      var to = param.to;
      delete param.to;
      // Enabling story.link macros with full URL in parameter:
      if (to && to.contains("://")) {
        html.link({href: to}, param.text);
        url = text = ".."; // Ugly hack to prevent HopObject.link in code from being rendered as well
      } else {
        // Compatibility for more recent link macros /////???, doing a lot of i18n witchcraft
        url = args[1] || ".";
        text = args[2];
        var action = url.split(/#|\?/)[0];
        if (!text) {
          action === "." && (action = obj._id);
          text = action.capitalize(); //gettext(action.capitalize());
        }
      }
      return [param, to || url, param.text || text, args[3]];
    });
  }
}());

(function() {
  var func;
  if (Archive.prototype.onCodeUpdate) {
    func = Archive.prototype.onCodeUpdate;
  }
  Archive.prototype.onCodeUpdate = function() {
    func && func.call(this);
    return helma.aspects.addBefore(this, "main_action", aspects.fixPager);
  }
}());

(function() {
  var func;
  if (Image.prototype.onCodeUpdate) {
    func = Image.prototype.onCodeUpdate;
  }
  Image.prototype.onCodeUpdate = function() {
    func && func.call(this);
    return helma.aspects.addBefore(this, "update", aspects.setTopics);
  }
}());

Images.prototype.onCodeUpdate = function() {
  return helma.aspects.addAround(this, "getPermission", function(args, func, images) {
    var permission = func.apply(images, args);
    if (!permission) {
      switch (args[0]) {
        case "topics":
        return true;
      }
    }
    return permission;
  });
}

Layout.prototype.onCodeUpdate = function() {
  helma.aspects.addAround(this, "getPermission", function(args, func, layout) {
    var permission = func.apply(layout, args);
    if (!permission) {
      switch (args[0]) {
        case "convert":
        return true;
      }
    }
    return permission;
  });
  return helma.aspects.addAround(this, "image_macro", function(args, func, layout) {
    args = aspects.fixMacroParams(args);
    var url = args[3];
    url && res.push();
    func.apply(layout, args);
    url && link_filter(res.pop(), {}, url);
    return;
  });
}

Members.prototype.onCodeUpdate = function() {
  helma.aspects.addAround(this, "getPermission", function(args, func, members) {
    var permission = func.apply(members, args);
    if (!permission) {
      switch(args[0]) {
        case "sendpwd":
        return true;
      }
    }
    return permission;
  });
}

(function() {
  var func;

  if (Site.prototype.onCodeUpdate) {
    func = Site.prototype.onCodeUpdate;
  }

  Site.prototype.onCodeUpdate = function() {
    func && func.call(this);

    helma.aspects.addAround(this, "getPermission", function(args, func, site) {
      var permission = func.apply(site, args);
      if (!permission) {
        switch(args[0]) {
          case "rss":
          case "feeds":
          case "mostread":
          return true;
        }
      }
      return permission;
    });

    helma.aspects.addBefore(this, 'search_action', function (args, func, site) {
      const provider = getProperty('search.provider');
      if (provider === 'google') {
        if (req.data.q) {
          if (!req.data.q.contains('site:')) {
            res.redirect(site.href(req.action) + '?q=' + encodeURIComponent(req.data.q + ' site:' + site.href().replace('test.www.', '')));
          } else {
            req.data.q = req.data.q.replace(/\s+site:.+$/, String.EMPTY);
          }
        }
        res.data.title = gettext('Search');
        res.data.body = site.renderSkinAsString('$Site#googleSearch');
        site.renderSkin('Site#page');
        res.stop(); // Otherwise Site.search_action() in code will be rendered, too!
        return;
      }
    });

    return helma.aspects.addBefore(this, "main_action", aspects.fixPager);
  }
}());

(function() {
  var func;
  if (Story.prototype.onCodeUpdate) {
    func = Story.prototype.onCodeUpdate;
  }
  Story.prototype.onCodeUpdate = function() {
    func && func.call(this);
    helma.aspects.addBefore(this, "edit_action", aspects.fixStoryEditorParams);
    return helma.aspects.addBefore(this, "update", aspects.setTopics);
  }
}());

Stories.prototype.onCodeUpdate = function() {
  return helma.aspects.addBefore(this, "create_action",
      aspects.fixStoryEditorParams);
}

File.prototype.onCodeUpdate = function() {
  return helma.aspects.addAround(this, 'description_macro', function(args, func, file) {
    var param = args[0];
    if (param.as === "editor") {
      file.input_macro(param, "description");
    } else {
      func.apply(file, args);
    }
  })
};
