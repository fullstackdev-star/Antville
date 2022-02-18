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
 * @fileOverview Defines the Vote prototype.
 */

markgettext('Vote');
markgettext('vote');
markgettext('a vote');


/**
 * @param {Choice} choice
 * @returns {Vote}
 */
Vote.add = function(choice, poll) {
  HopObject.confirmConstructor(Vote);
  var vote = new Vote;
  vote.choice = choice;
  vote.creator = session.user;
  vote.creator_name = session.user.name;
  vote.created = vote.modified = new Date;
  poll.votes.add(vote);
	return vote;
}

/**
 * @name Vote
 * @constructor
 * @property {Choice} choice
 * @property {Date} created
 * @property {User} creator
 * @property {String} creator_name
 * @property {Date} modified
 * @property {Poll} poll
 * @extends HopObject
 */
Vote.prototype.constructor = function(choice) {
  HopObject.confirmConstructor(this);
  return this;
}
