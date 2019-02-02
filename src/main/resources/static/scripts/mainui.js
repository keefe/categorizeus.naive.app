var tmplBasicDocument;
var tmplBasicDocumentEdit;
var tmplLogin;
var tmplRegister;
var tmplIndividualComment;
var tmplNavigation;
var tmplSettings;

var currentUser = null;
var tagSelectMode = false;
var currentThread;
var currentMessages = null;
var id2messages = {};
var poll = false;
var pollInterval = null;
var tagShortcuts = [];
var pendingUpdates = [];
var updateTimer;
var totalMessages = 0;
var messageResetCount = 100;

var settings = {
	pollRate : 3000,
	updateBatchSize : 1,
	uiUpdateRate : 1500
};
var query = {
	tags : [],
	loadMetadata : true,
	after : null,
	before : null,
	count : 20,
	sortBy : "desc"
};
var previousBounds = [];
var templates = {};
var ui;

var initialize = function(dontDoInitialSearch){
	var templateSources = [
			{name:"tmplBasicDocument", url:"/templates/basic_doc.hbrs"},
			{name:"tmplBasicDocumentEdit", url:"/templates/basic_doc_edit.hbrs"},
			{name:"tmplLogin", url:"/templates/login.hbrs"},
			{name:"tmplIndividualComment", url:"/templates/individual_comment.hbrs"},
			{name:"tmplNavigation", url:"/templates/basic_navigation.hbrs"},
			{name:"tmplSettings", url:"/templates/basic_settings.hbrs"},
			{name:"tmplControls", url:"/templates/basic_controls.hbrs"}
	];
	ui = new UI(templateSources);
	ui.initialize(function(err, user){
			currentUser = user;
			finishInitialize(dontDoInitialSearch);
	});
}

var finishInitialize = function(dontDoInitialSearch){
	tmplBasicDocument = ui.templates["tmplBasicDocument"];
	tmplBasicDocumentEdit = ui.templates["tmplBasicDocumentEdit"];//notice the pattern, probably put these in an object and generalize
	tmplLogin = ui.templates["tmplLogin"];
	tmplIndividualComment = ui.templates["tmplIndividualComment"];
	tmplNavigation= ui.templates["tmplNavigation"];
	tmplSettings= ui.templates["tmplSettings"];
	$("#controlsPane").html(ui.templates["tmplControls"]({}));
	displayUser(currentUser);
  if(!dontDoInitialSearch){
  	ui.search([], displayMessages);
  }
	$('#signinButton').click(function() {
		window.location.href = "/v1/auth/oauth/google";
	});
	$("#btnShowLogin").click(function(){
		if(ui.user==null){
			console.log("Clicking Login Button");
			displayLoginForm("#editor");
		}else{
			ui.api.logoutUser(function(err, user){
				if(err!=null){
					$(".userGreeting").html("<h1> "+err+"</h1>");
					return;
				}
				ui.user = null;//maybe this goes into a function on ui, dunno
				$("#btnShowLogin").prop("value", "login");
				$("#signinButton").show();
				$(".userGreeting").html("");
			});
		}
	});
	$("#btnCategorizeUs").click(function(){
		var settingHtml = ui.tmpl("tmplSettings",ui.settings);
		var controls = $("#editor").html(settingHtml);
		controls.find(".btnSaveSettings").click(function(){
			var pollRate = parseInt(controls.find(".txtPollRate").val());
			console.log("Poll Rate Read as " + pollRate);
			ui.settings.pollRate = pollRate;
			ui.settings.updateBatchSize =  parseInt(controls.find(".txtUpdateBatchSize").val());
			ui.settings.uiUpdateRate =  parseInt(controls.find(".txtUpdateRate").val());

			if(poll){
				stopPolling();
				startPolling();
			}
			controls.empty();
		});
		controls.find(".closeButton").click(function(){
			controls.empty();
		});
	});
	$("#btnPost").click(function(){
		if(currentUser==null){
			displayLoginForm("#editor");
		}else{
			displayEditForm("#editor", {}, function(){
				ui.searchByQuery(ui.query, displayMessages);
			});
		}
	});

	$("#btnSearch").click(function(){
		if(tagSelectMode){
  			var tags = $("#txtTagSearch").val();
    		tagSelectedMessages(tags);
    		return;
		}
		var tags = $("#txtTagSearch").val();
		var tagArray = stringToTags(tags);
		ui.search(tagArray, displayMessages);
	});

	$("#btnTag").click(function(){
	    tagSelectMode = !tagSelectMode;
	    $(".taggingStuff").toggleClass("unseen");
	    $("#btnTag").toggleClass('selected');
	    $(".basicDocument").toggleClass('selectable');
	    if(tagSelectMode){
	      $("#btnSearch").html("Apply Tag");
	      Mousetrap.bind("1", function(){
  			var tags = $("#txtTagSearch").val();
				tagSelectedMessages(tags);
	    });
	      /*
  	      Mousetrap.bind(["command+shift+1","ctrl+shift+1"], function(){
  			var tags = $("#txtTagSearch").val();
			alert("remove tags " + tags);
			//tagSelectedMessages(tags);
	      });*/
	    }else{
	      $(".basicDocument").removeClass('selected');
	      Mousetrap.unbind("1");
	      for(var i=0; i<tagShortcuts.length;i++){
	      	Mousetrap.unbind((i+2)+"");
	      }
	      tagShortcuts = [];
	      $("#tagPresets").empty();
	      $("#btnSearch").html("Search");
	    }
    	return;
	});
	$("#btnAddTag").click(function(){
		var tags = $("#txtTagSearch").val();
		var which = tagShortcuts.length+2;
		tagShortcuts.push(tags);
		$("#tagPresets").append("["+which+"]"+tags+"&nbsp;");
		Mousetrap.bind(""+which, (function(tags){
			return function(){
				tagSelectedMessages(tags);
			}
		})(tags));
	});

	$("#btnPlay").click(function(){
		poll = !poll;
		if(poll){
			startPolling();
		}else {
			stopPolling();
		}
	});
}
var startPolling = function(){
	$("#btnPlay").removeClass("playButton");
	$("#btnPlay").addClass("stopButton");
	pollInterval = setInterval(function(){
		checkForUpdates();
	}, settings.pollRate);
	addMessageUpdate();
};
var displayUser = function(user){
	if(user!=null){
			$("#btnShowLogin").prop("value", "logout");
			$("#signinButton").hide();
			console.log(user);
			$(".userGreeting").html("Hi, "+user.username+"!");
	}
}
var checkForUpdates = function(){
	ui.checkForUpdates(updateMessages);
};

var stopPolling = function(){
	$("#btnPlay").removeClass("stopButton");
	$("#btnPlay").addClass("playButton");
	clearInterval(pollInterval);
	clearTimeout(updateTimer);
};

var addMessageUpdate = function(){
	var addedThisBatch = 0;
	while(pendingUpdates.length>0 && addedThisBatch < ui.settings.updateBatchSize){
		var aMessage = pendingUpdates.shift();
		console.log("Adding " + aMessage.message.id);
		if(!ui.id2messages[aMessage.message.id]){
			addedThisBatch++;
			ui.totalMessages++;
			ui.id2messages[aMessage.message.id] = aMessage;
			ui.currentMessages.unshift(aMessage);
			var appliedTemplate = $(tmplBasicDocument(aMessage));
			var newMessage = null;
			if(ui.query.sortBy=="desc"){
				newMessage = $("#content").prepend(appliedTemplate);
			}else{
				newMessage = $("#content").append(appliedTemplate);
			}
			wireMessageSummary(aMessage, appliedTemplate);
		}
	}
	var thisManyTooMany = ui.totalMessages - messageResetCount;
	for(var i=0; i<thisManyTooMany;i++){
		var staleMessage = ui.currentMessages.pop();
		var messageSelector = ".categorizeus"+staleMessage.message.id;
		ui.totalMessages--;
		$(messageSelector).remove();
	}
	var messagesInFrame = $(".basicDocument").length;

	console.log("Total in grid " + messagesInFrame + "Added this Batch " + addedThisBatch + " still pending " + pendingUpdates.length + " batch " + settings.updateBatchSize);
	updateTimer = setTimeout(addMessageUpdate, settings.uiUpdateRate);
};
var updateMessages = function(err, messages){
	var s = "";
	for(var i = 0; i<messages.length; i++){
		var aMessage = messages[i];
		s = s + aMessage.message.id+",";
		pendingUpdates.push(aMessage);
		//TODO dupes in here somehow?
		//debugger;
		/*if(currentMessages.length==0 ||
			parseInt(aMessage.message.id) > parseInt(currentMessages[0].message.id)){
			pendingUpdates.push(aMessage);//TODO dupes in here somehow?
		}*/
	}
	console.log("Add these " + s);
}


var displayMessages = function(err, messages){
	$("#content").empty();
	for(let aMessage of messages){
		var appliedTemplate = $(ui.tmpl("tmplBasicDocument",aMessage));
		var newMessage = $("#content").append(appliedTemplate);
		wireMessageSummary(aMessage, appliedTemplate);
	}
	$("#content").append($(tmplNavigation({})));
	$("#content").find(".nextLink").click(function(event){
		ui.nextPage(displayMessages);
	});
	$("#content").find(".previousLink").click(function(event){
		ui.previousPage(displayMessages);
	});
};

var wireMessageSummary = function(aMessage, appliedTemplate){
	appliedTemplate.bind('click',
	   (function(template, message){
					return function(event){
					      handleGridDocumentClick(event, template, message);
					}
	   })(appliedTemplate, aMessage)
	);

	var qry = ".basicDocument.categorizeus"+aMessage.message.id;
	var newMessageView = $("#content").find(qry);
	appliedTemplate.hover(function(){
			if(tagSelectMode){
				appliedTemplate.addClass("candidate");
			}
		}, function(){
			appliedTemplate.removeClass("candidate");
	});
	newMessageView.find(".viewButton").click((function(message){
		return function(event){
			console.log("View button is clicked for " + message.message.id);
			ui.api.loadMessage(message.message.id, function(error, messageThread){
				console.log(messageThread);
				displayMessageThread(message, messageThread);
			});
		};
	})(aMessage));
};



var tagSelectedMessages = function(tags){
	var tagArray = stringToTags(tags);
	var whichTagged = [];
	$('.basicDocument.selected').each(function () {
		whichTagged.push(this.id);
	});
	$('.basicDocument.candidate').each(function () {
		whichTagged.push(this.id);
	});

	if(tagArray.length==0){
		$("#status").html("<h1>Please provide tags when tagging</h1>");
		return;
	}
	if(whichTagged.length==0){
		$("#status").html("<h1>Please select messages when tagging</h1>");
		return;
	}
	ui.api.tagMessages(tagArray, whichTagged,function(err, message){
		    $('.basicDocument.selected').toggleClass('selected');
		    $('.basicDocument.candidate').toggleClass('candidate');

			//tagSearchThread(lastTags, displayMessages);
			for(var i=0; i<whichTagged.length;i++){
				var aMessage = id2messages[whichTagged[i]];
				for(var j=0; j<tagArray.length;j++){
					if(!aMessage.tags.includes(tagArray[j])){
						aMessage.tags.push(tagArray[j]);
					}
				}
				var selector = ".categorizeus" + whichTagged[i];
				//debugger
				var appliedTemplate = $(tmplBasicDocument(aMessage));
				$(selector).replaceWith(appliedTemplate);
				wireMessageSummary(aMessage, appliedTemplate);
			}
			if(err!=null){
				$("#status").html(err);
			}else{
				$("#status").html("Tagged Messages Successfully");
			}
	});
}


var displayEditForm = function(container, sourceMsg, cb){//#TODO don't just replace
	var controls = $(container).append(tmplBasicDocumentEdit(sourceMsg));
	controls.find(".inputMsgBtn").click(dynamicEditSubmit(controls, cb));
	controls.find(".closeButton").click(function(event){
		controls.find(".basicDocumentEdit").remove();
	});
}

var displayLoginForm = function(container){ //#TODO hey we are seeing a template pattern here, let's generalize it
	var controls = $(container).html(tmplLogin({}));
	controls.find(".btnLogin").click(dynamicLogin(controls));
	controls.find(".closeButton").click(function(){
		controls.empty();
	});
}

var handleGridDocumentClick = function(event, template, message){
	if(tagSelectMode ){
    //&& event.target.tagName != "IMG" && event.target.tagName != "INPUT"
		console.log(message);
		template.toggleClass('selected');
    	event.preventDefault();
	}else{
	  if(event.target.tagName == "IMG"){
	    console.log("You clicked an image, way to go");
      //event.preventDefault();
	  }
	}
}

var displayMessageThread = function(message, thread){
	$("#content").empty();
	currentMessage = message;
	ui.api.updateAttachmentLinks(message);
	var id2message = {};
	id2message[message.message.id] =  message;
	for(var msg of thread){
		id2message[msg.message.id] = msg;
	}
	for(var msg of thread){
		ui.api.updateAttachmentLinks(msg);
		if(!id2message[msg.message.repliesTo].children){
			id2message[msg.message.repliesTo].children = [];
		}
		id2message[msg.message.repliesTo].children.push(msg);
	}

	var traverseThread = function(msg, depth){
		addComment(msg, depth);
		msg.visited = true;

		if(msg.children)
		for(var reply of msg.children){
			if(!reply.visited){
					traverseThread(reply, depth+1);
			}
		}
	}
	traverseThread(message, 0);
//newMessageView.find(".replyButton").click(displayMessageEditorCB(message, newMessageView));
}
var addComment = function(message, depth){
	var leftPad = 65 + depth*35;
	var appliedTemplate = $(tmplIndividualComment(message));
	var newFullMessage = $("#content").append(appliedTemplate);
	appliedTemplate.css("padding-left", leftPad+"px");
	var newMessageView = $("#content").find(".categorizeus"+message.message.id);
	newMessageView.find(".closeButton").click((function(message, messageView){
			return function(event){//TODO this is completely wrong, review!
				ui.api.tagSearchThread(query, displayMessages);
			};
	})(message, newMessageView));
	newMessageView.find(".replyButton").click((function(message, messageView){
			return function(event){
				console.log("Reply to " + message.message.id);
				displayEditForm("#editor", {}, function(){
					ui.api.loadMessage(currentMessage.message.id, function(error, messageThread){
						console.log(messageThread);
						displayMessageThread(currentMessage, messageThread);
					});
				});
				$(".repliesToId").val(message.message.id);
			};
	})(message, newMessageView));
}
var dynamicLogin = function(el){
	return function(){
		var username = el.find(".txtUsername").val();
		var password = el.find(".txtPassword").val();
		ui.api.loginUser(username, password, function(err, user){
			if(err!=null){
				$(".userGreeting").html("<h1>"+err+"</h1>");
			}else{//TODO merge with the logout, get current user stuff
				currentUser = user;
				$("#btnShowLogin").prop("value", "logout");
    		$(".userGreeting").html("Hi, "+user.username+"!");
			}
			el.empty();
		});
	};
}

var dynamicEditSubmit = function(el, cb){

	return function(){
		console.log("Dynamically bound control OK");
		var title = el.find(".inputMsgTitle").val();
		var tags = el.find(".inputMsgTags").val();
		var body = el.find(".inputMsgBody").val();
		var id = el.find(".inputMsgId").val();
		var repliesToId = el.find(".repliesToId").val();
		var file = el.find(".inputFileAttachment");
		var isNew = (!id) || id.length==0;
		console.log(id + " is new? " + isNew + " " + title + " & " + body);
		if(repliesToId!=null && repliesToId.length>0){
			console.log("Posting a reply to " + repliesToId);
		}
    	el.find(".basicDocumentEdit").prepend("<h1>Processing your new message, please wait......</h1>");
		if(isNew){
			var newMessage = {
				body:body,
				title:title,
				tags:tags
			};
			if(repliesToId!=null&& repliesToId.length>0){
				newMessage.repliesTo = repliesToId;
				newMessage.rootRepliesTo = currentMessage.message.id;
			}
			var handleCreatedMessage = function(err, response){
				if(err!=null){
					$("#status").append("<p>Error: " + err + "</p>");
				}else{
					$("#status").append("<p>Created new document with id " + response.id + "</p>");
				}
				el.empty();
				if(cb!=null){
					newMessage.id = response.id;
					cb(newMessage);
				}
			}
			if(file.val()!==''){//file[0].files.length?
				console.log("Found an attached file");
				console.log(file[0].files);
				ui.api.createMessageWithAttachment(newMessage, file[0].files, handleCreatedMessage);
				return;
			}
			ui.api.createMessage(newMessage, handleCreatedMessage);

		}else{
			$("#status").append("<p>Currently, editing existing docs not supported. Clear and try again.</p>");
		}
		el.empty();
	};
}
