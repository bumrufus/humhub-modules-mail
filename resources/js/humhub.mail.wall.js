humhub.module('mail.wall', function(module, require, $) {

   var Widget = require('ui.widget').Widget;
   var loader = require('ui.loader');
   var modal = require('ui.modal');
   var client = require('client');
   var additions = require('ui.additions');
   var object = require('util.object');
   var event = require('event');

   var ConversationView = Widget.extend();

    ConversationView.prototype.init = function() {
        additions.observe(this.$);
        this.reload();
    };

    ConversationView.prototype.loader = function(load) {
        if(load !== false) {
            loader.set(this.$);
        } else {
            loader.reset(this.$);
        }
    };

    ConversationView.prototype.loadUpdate = function() {
        var  $lastEntry = this.$.find('.mail-conversation-entry:last');
        var lastEntryId = $lastEntry.data('entry-id');
        var data = {id: this.options.messageId, from: lastEntryId};

        var that = this;
        client.get(this.options.loadUpdateUrl, {data:data}).then(function(response) {
            if(response.html) {
                that.appendEntry(response.html);
            }
        })
    };

    ConversationView.prototype.reply = function(evt) {
        var that = this;
        client.submit(evt).then(function(response) {
            if(response.success) {
                $('#replyform-message').val('');
                that.appendEntry(response.content);
            } else {
                module.log.error(response, true);
            }
        }).catch(function(e) {
            module.log.error(e, true);
        });
    };

    ConversationView.prototype.updateContent = function(html) {
        this.$.hide().html(html).fadeIn();
        this.getListNode().niceScroll({
            cursorwidth: "7",
            cursorborder: "",
            cursorcolor: "#555",
            cursoropacitymax: "0.2",
            nativeparentscrolling: false,
            railpadding: {top: 0, right: 0, left: 0, bottom: 0}
        });
        this.scrollToBottom();
    };

    ConversationView.prototype.reload = function(dom) {
        this.loadMessage(this.options.messageId);
    };

    ConversationView.prototype.addUser = function(evt) {
        var that = this;

        that.loader(true);
        client.submit(evt).then(function(response) {
            if(response.error) {
                module.log.error(response, true);
                that.reload();
            } else {
                that.updateContent(response.html);
            }
        }).catch(function(e) {
           module.log.error(e, true);
        }).finally(function() {
            that.loader(false);
        });
    }

    ConversationView.prototype.appendEntry = function(html) {
        var that = this;
        var $html = $(html);

        // Filter out all script/links and text nodes
        var $elements = $html.not('script, link').filter(function () {
            return this.nodeType === 1; // filter out text nodes
        });

        // We use opacity because some additions require the actual size of the elements.
        $elements.css('opacity', 0);

        // call insert callback
        this.getListNode().append($html);

        $elements.hide().css('opacity', 1).fadeIn('fast', function () {
            that.scrollToBottom();
            that.onUpdate();
        });

    };

    ConversationView.prototype.loadMessage = function(evt) {
        var messageId = object.isNumber(evt) ? evt : evt.$trigger.data('message-id');
        var that = this;
        this.loader();
        client.get(this.options.loadMessageUrl, {data: {id:messageId}}).then(function(response) {
            that.options.messageId = messageId;
            that.updateContent(response.html);
        }).catch(function(e) {
            module.log.error(e, true);
        }).finally(function() {
            that.loader(false);
        });
    };

    ConversationView.prototype.scrollToBottom = function() {
        $('html, body').animate({scrollTop:$(document).height()}, 'slow');
        var $list = this.getListNode();
        $list.scrollTop($list[0].scrollHeight);
    };

    ConversationView.prototype.getListNode = function() {
        return this.$.find('.conversation-entry-list');
    };

    ConversationView.prototype.onUpdate = function() {
        this.getListNode().getNiceScroll().resize();
    };

    var ConversationEntry = Widget.extend();

    ConversationEntry.prototype.replace = function(dom) {
        var that = this;
        $content = $(dom).hide();
        this.$.fadeOut(function() {
            $(this).replaceWith($content);
            that.$ = $content;
            that.$.fadeIn('slow');
        });
    };

    ConversationEntry.prototype.remove = function() {
        this.$.fadeToggle('slow', function() {
            $(this).remove();
        });
    };

    var submitEditEntry = function(evt) {
        modal.submit(evt).then(function(response) {
            if(response.success) {
                var entry = getEntry(evt.$trigger.data('entry-id'));
                if(entry) {
                    setTimeout(function() {
                        entry.replace(response.content);
                    }, 300)
                }

                return;
            }

            module.log.error(null, true);
        }).catch(function(e) {
            module.log.error(e, true);
        });
    };

    var deleteEntry = function(evt) {
        var entry = getEntry(evt.$trigger.data('entry-id'));

        if(!entry) {
            module.log.error(null, true);
            return;
        }

        client.post(entry.options.deleteUrl).then(function(response) {
            modal.global.close();

            if(response.success) {
                setTimeout(function() { entry.remove(); }, 1000);
            }
        }).catch(function(e) {
            module.log.error(e, true);
        });
    };

    var getEntry = function(id) {
        return Widget.instance('.mail-conversation-entry[data-entry-id="'+id+'"]');
    };

    var getRootView = function() {
        return Widget.instance('#conversation_view_root');
    }

    var init = function() {
       event.on('humhub:modules:mail:live:NewUserMessage', function (evt, events, update) {
           debugger;
           var root = getRootView();
           var messageIds = [];
           events.forEach(function(event) {
               if(root && root.options.messageId == event.data.message_id) {
                   root.loadUpdate();
               } else {
                   messageIds[event.data.message_id] = messageIds[event.data.message_id] ? messageIds[event.data.message_id] ++ : 1;
                   // TODO: add badge to preview
               }
               setMailMessageCount(event.data.count);
           });

           //TODO: update notification count
       }).on('humhub:modules:mail:live:UserMessageDeleted', function (evt, events, update) {
           events.forEach(function(event) {
               var entry = getEntry(event.data.entry_id);
               if(entry) {
                   entry.remove();
               }
               setMailMessageCount(event.data.count);
           });
       });
    };

    function setMailMessageCount(count) {
        // show or hide the badge for new messages
        if (!count || count == '0') {
            $('#badge-messages').css('display', 'none');
        } else {
            $('#badge-messages').empty();
            $('#badge-messages').append(count);
            $('#badge-messages').fadeIn('fast');
        }
    }

    var loadMessage = function(evt) {
        debugger;
        var root = getRootView();
        if(root) {
            root.loadMessage(evt);
        } else {
            client.pjax.redirect(evt.url);
        }

        evt.finish();
    }

   module.export({
       init: init,
       ConversationView: ConversationView,
       ConversationEntry: ConversationEntry,
       loadMessage: loadMessage,
       submitEditEntry: submitEditEntry,
       deleteEntry: deleteEntry,
       setMailMessageCount: setMailMessageCount
   });
});