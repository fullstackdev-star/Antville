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

relocateProperty(Layout, "alias", "name");
relocateProperty(Layout, "parent", "ancestor");
relocateProperty(Layout, "createtime", "created");
relocateProperty(Layout, "modifytime", "modified");

Layout.prototype.__defineGetter__("shareable", function() {
  return this.mode === Layout.SHARED;
});

Layout.prototype.__defineSetter__("shareable", function(value) {
  this.mode = !!value ? Layout.SHARED : Layout.DEFAULT;
  return;
});

Layout.prototype.getTitle = function() {
  return gettext("Layout");
}

Layout.prototype.title_macro = function(param) {
  if (param.as === "editor") {
    this.input_macro(param, "title");
  } else if (param.linkto) {
    (param.linkto === "main") && (param.linkto = "");
    this.link_filter(this.title, param, param.linkto);
  } else {
    res.write(this.title);
  }
  return;
}

Layout.prototype.description_macro = function(param) {
  if (param.as == "editor") {
    this.textarea_macro(param, "description");
  } else if (this.description) {
    if (param.limit) {
      res.write(this.description.clip(param.limit, "...", "\\s"));
    } else {
      res.write(this.description);
    }
  }
  return;
}

Layout.prototype.parent_macro = function(param) {
  if (param.as === "editor") {
    this.select_macro(param, "parent");
  } else if (this.parent) {
    res.write(this.parent.title);
  }
  return;
}

Layout.prototype.shareable_macro = function(param) {
  if (param.as == "editor" && !this.site) {
    // FIXME: HopObject.createCheckBoxParam() is obsolete
    var inputParam = this.createCheckBoxParam("shareable", param);
    if (req.data.save && !req.data.shareable)
      delete inputParam.checked;
    Html.checkBox(inputParam);
  } else if (this.shareable)
    res.write(param.yes || "yes");
  else
    res.write(param.no  || "no");
  return;
}

Layout.prototype.testdrivelink_macro = function(param) {
  return this.link_macro(param, "test", param.text || "test");
}

Layout.prototype.deletelink_macro = function(param) {
  return this.link_macro(param, "delete", param.text || "delete");
}

Layout.prototype.activatelink_macro = function(param) {
  return this.link_macro(param, "activate", param.text || "activate");
}
