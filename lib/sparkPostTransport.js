'use strict';

// Dependencies
const pkg = require('../package');
const SparkPost = require('sparkpost');
const emailAddresses = require('email-addresses');

// Constructor
var SparkPostTransport = function SparkPostTransport(options) {
  // Set required properties
  this.name = 'SparkPost';
  this.version = pkg.version;
  options = options || {};

  // Set the SparkPost API Key (must have appropriate Transmission resource permissions)
  this.sparkPostApiKey = process.env.SPARKPOST_API_KEY || options.sparkPostApiKey;
  this.sparkPostEmailClient = new SparkPost(this.sparkPostApiKey);

  // Set any options which are valid
  for (var opt in options) {
    this[opt] = (options.hasOwnProperty(opt)) ? options[opt] : undefined;
  }

  return this;
};

function transformAttachment(data) {
  return {
    type: data.contentType,
    name: data.filename,
    data: data.encoding === 'base64' ? data.content : undefined // todo: content transforming
  };
}

function parseEmail(address) {
  if (!address) {
    return;
  }

  if (address instanceof Object) {
    return {
      address: {
        email: address.address,
        name: address.name
      }
    };
  }

  var arr = (emailAddresses.parseAddressList(address) || []).map(parsed => ({
    address: {
      email: parsed.address,
      name: parsed.name
    }
  }));

  return arr.length > 1 ? arr : arr[0];
}

SparkPostTransport.prototype.send = function send(payload, callback) {
  var email = {
    transmissionBody: {
        // Apply default options and override if provided in mail object
        tags: (payload.data.tags) ? payload.data.tags : this.tags,
      campaign_id: (payload.data.campaign_id) ? payload.data.campaign_id : this.campaign_id,
      metadata: (payload.data.metadata) ? payload.data.metadata : this.metadata,
      substitution_data: (payload.data.substitution_data) ? payload.data.substitution_data : this.substitution_data,
      options: (payload.data.options) ? payload.data.options : this.options,
      content: Object.assign({}, this.content || {}, {
        from: parseEmail(payload.data.from),
        subject: payload.data.subject,
        html: payload.data.html,
        text: payload.data.text,
        reply_to: payload.data.replyTo,
        attachments: (payload.data.attachments || []).map(transformAttachment).filter(attachment => attachment.data)
    }, payload.data.content || {}),
    recipients: (payload.data.recipients) ? payload.data.recipients : this.recipients
    }
  };

  email.transmissionBody.recipients = ['to', 'cc', 'bcc'].reduce((arr, key) => arr.concat([].concat(payload.data[key]).reduce((p, address) => p.concat(parseEmail(address) || []), [])), [].concat(email.transmissionBody.recipients ? email.transmissionBody.recipients : []));

  // Send the transmission using Sparkpost
  this.sparkPostEmailClient.transmissions.send(email, function(err, res) {
    if (err) {
      return callback(err);
    }
    // Example successful Sparkpost transmission response:
    // { "results": { "total_rejected_recipients": 0, "total_accepted_recipients": 1, "id": "66123596945797072" } }
    return callback(null, {
      messageId: res.body.results.id,
      accepted: res.body.results.total_accepted_recipients,
      rejected: res.body.results.total_rejected_recipients
    });
  });
};

module.exports = function(options) {
  return new SparkPostTransport(options);
};
