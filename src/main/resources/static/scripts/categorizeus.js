/**
This is the javascript http api for a categorize.us server, using jquery.
There should be no UI specific code in this file, it should all be in callbacks.
**/
//var deployPrefix = "https://ectiaevu68.execute-api.us-west-2.amazonaws.com/testing";
var deployPrefix = "/v1";
var pageOn = 0;
var pageSize = 10;
var lastTags = null;

var tagMessage = function(messageId, tag, cb){
	$.ajax({
		headers: {
			Accept: "application/json; charset=utf-8"
		},
		url:deployPrefix+'/messages/'+messageId+"/tags/"+tag,
		accepts:'application/json',
		method:'PUT',
		contentType:"application/json"
	}).done(function(message, statusCode){
		if(cb){//TODO check for status code here?
			cb(null, message);
		}
	}).fail(function(){
		if(cb){
			cb("Can't tag messages for some reason");
		}
	});
}
var tagMessages = function(tagArray, messageIdArray, cb){
	for(var messageId of messageIdArray){
		for(var tag of tagArray){
			tagMessage(messageId, tag);//callback hell, need to rewrite this to tag one, do next etc some async thing
		}
	}
};

var tagSearch = function(tagArray, cb){
	var payload = {
		tags:tagArray
	};
	$.ajax({
		url:deployPrefix+'/tag/',
		accepts:'application/json',
		method:'POST',
		contentType:"application/json",
		data:JSON.stringify(payload)
	}).done(function(messages, statusCode){
		if(statusCode!='success'){
			if(cb){
				cb("Error doing tag search!");
			}
		}else if(cb){
			cb(null, messages);
		}
	});
};

var tagSearchThread = function(tagArray, cb){
	lastTags = tagArray;
	pageOn = 0;
	pageSize = 10;
	searchThreadCriteria(tagArray, cb);
};

var searchThreadCriteria = function(tagArray, cb){
	$.ajax({
		headers: {
			Accept: "application/json; charset=utf-8"
		},
		url:deployPrefix+'/messages?loadMetadata=true&tags='+tagArray.join()+'&pageOn='+pageOn+'&pageSize='+pageSize,
		method:'GET'
	}).done(function(messages, statusCode){//TODO fail handler
		if(statusCode!='success'){
			if(cb){
				cb("Error doing tag search!");
			}
		}else if(cb){
			cb(null, messages);
		}
	});
};
var nextPage = function(cb){
	pageOn++;
	searchThreadCriteria(lastTags,cb);
}
var previousPage = function(cb){
	pageOn--;
	if(pageOn<0) pageOn = 0;
	searchThreadCriteria(lastTags,cb);
}

var loadMessage = function(id, cb){
	$.ajax({
		headers: {
			Accept: "application/json; charset=utf-8"
		},
		url:deployPrefix+'/messages/'+id+'/thread'
	}).done(function(messageThread, statusCode){
		console.log("In Response " + statusCode);
		if(statusCode!='success'){
			if(cb){
				cb("Error doing doc load!", response);
			}
		}else if(cb){
			cb(null, messageThread);
		}
	});

};

var createMessage = function(message, cb){
	//adapting message to new format, hackish
	var tags = message.tags;
	delete message.tags;
	$.ajax({
		url:deployPrefix+'/messages/',
		method:'POST',
		contentType:"application/json",
		data:JSON.stringify(message)
	}).done(function(response, statusCode){
		console.log("In Response " + statusCode);
		console.log(response);
		if(tags && tags.length>0){
			var tagArray = tags.split(",");
			for(var t of tagArray){
				tagMessage(response.id, t);
			}
		}
		if(statusCode!='success'){
			if(cb){
				cb("Please Login to Post", response);
			}
		}else if(cb){
			cb(null, response);
		}
	}).fail(function(){
		cb("Please Login to Post");
	});
};

var createMessageWithAttachment = function(message, files, cb){
  /*var reader = new FileReader();
  reader.addEventListener("load", function(){
		message.attachment = {
      name:files[0].name,
      type:files[0].type,
      dataURL:reader.result,
      size:files[0].size
    }
		reader.readAsArrayBuffer(files[0]);

		var fd = new FormData();
		fd.append("file", reader.result);
  });*/
  if(files[0]!=null){
    console.log(files[0]);
    if(files[0].type.startsWith("image")){
			createMessage(message, function(error, uploadedMessage){
				if(error){
					if(cb){
						cb(error);
					}
					return;
				}
				var fd = new FormData();
				fd.append("file", files[0]);
				$.ajax({
					headers: {
						Accept: "application/json; charset=utf-8"
					},
					url:deployPrefix+'/messages/'+uploadedMessage.id+"/attachments",
					method:'POST',
					contentType: false,
					mimeType: 'multipart/form-data',
					processData:false,
					data:fd
				}).done(function(response, statusCode){
					console.log("In Response " + statusCode);
					console.log(response);
					if(statusCode!='success'){
						if(cb){
							cb("Please Login to Post", response);
						}
					}else if(cb){
						cb(null, response);
					}
				}).fail(function(){
					cb("Please Login to Post");
				});
			});
    }else{
      alert("Invalid Attachment detected, please try again!");
    }
  }
}
function hex(buffer) {
  var hexCodes = [];
  var view = new DataView(buffer);
  for (var i = 0; i < view.byteLength; i += 4) {
    // Using getUint32 reduces the number of iterations needed (we process 4 bytes each time)
    var value = view.getUint32(i)
    // toString(16) will give the hex representation of the number without padding
    var stringValue = value.toString(16)
    // We use concatenation and slice for padding
    var padding = '00000000'
    var paddedValue = (padding + stringValue).slice(-padding.length)
    hexCodes.push(paddedValue);
  }

  // Join all the hex strings into one
  return hexCodes.join("");
}
var loginUser = function(username, password, cb){


	var buffer = new TextEncoder("utf-8").encode(password);
		crypto.subtle.digest("SHA-256", buffer).then(function (hash) {
		var user = {
			username:username,
			passhash:hex(hash)
		};
		$.ajax({
			url:deployPrefix+'/auth/login',
			method:'POST',
			contentType:"application/json",
			data:JSON.stringify(user)
		}).done(function(response, statusCode){
			console.log("In Response " + statusCode);
			if(statusCode!="success"){
				if(cb){
					cb("Error logging in! Please try again");
				}
			}else{
				if(cb){
					cb(null, response);//TODO what should this response be?
				}
			}

		});
	});

};

var fetchCurrentUser = function(cb){
	$.ajax({
		headers: {
			Accept: "application/json; charset=utf-8"
		},
		url:deployPrefix+'/users/principal',
		accepts:'application/json'
	}).done(function(currentUser, statusCode){
		console.log("In Response " + statusCode);
		if(statusCode!='success'){
			if(cb){
				cb("User is not Logged In", response);
			}
		}else if(cb){
			cb(null, currentUser);
		}
	}).fail(function(){
		if(cb!=null){
			cb("User is not Logged In");
		}
	});
};

var logoutUser = function(cb){
	$.ajax({
		headers: {
			Accept: "application/json; charset=utf-8"
		},
		url:deployPrefix+'/auth/logout',
		method:'POST'
	}).done(function(currentUser, statusCode){
		console.log("In Response " + statusCode);
		if(statusCode!='success'){
			if(cb){
				cb("User is not Logged In", response);
			}
		}else if(cb){
			cb(null, currentUser);
		}
	}).fail(function(){
		if(cb!=null){
			cb("User is not Logged In");
		}
	});
};


var registerUser = function(username, password, cb){
	var user = {
		username:username,
		password:password
	};
	$.ajax({
		url:deployPrefix+'/user/',
		method:'PUT',
		contentType:"application/json",
		data:JSON.stringify(user)
	}).done(function(response, statusCode){
		console.log("In Response " + statusCode);
		if(statusCode!="success"){
			if(cb){
				cb("Error registering! Please try again");
			}
		}else{
			if(cb){
				cb(null, response);//TODO what should this response be?
			}
		}
	});
}