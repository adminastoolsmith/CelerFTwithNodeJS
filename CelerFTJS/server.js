/**
 * Description - This code provides the functionality to do Gigabit file uploads using Node.js and Express.js.
 *               The client application uploads a Gigabit sized file to the Node.js backend in chunks, and each
 *               chunk is saved by the Node.js backend as a separate file. The chunks are sent as multipart/form-data
 *               encoded data. The data can either by a binary file or a base64 enocded version of the binary file.
 *               Once all of the data hase been received the client sends teh Node.js backend a mergeall command and
 *               the Node.js backend will merge all of the file chunks into a single file.
 *               
 * Author - Nigel Thomas
 * 
 * Copyright 2014 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

// The required modules
var express = require('express');
var formidable = require('formidable');
var fs = require('fs-extra');
var path = require('path');
var crypto = require('crypto');
var toobusy = require('toobusy-js');
var app = express();

// Set maximum lag to an aggressive value. 
toobusy.maxLag(10);

// Set check interval to a faster value. This will catch more latency spikes 
// but may cause the check to be too sensitive. 
toobusy.interval(250);

// Enables Cross-Origin Resource Sharing
// Taken from http://bannockburn.io/2013/09/cross-origin-resource-sharing-cors-with-a-node-js-express-js-and-sencha-touch-app/
var enableCORS = function (request, response, next) {
    response.header('Access-Control-Allow-Origin', '*');
    response.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    
    // intercept OPTIONS method    
    if ('OPTIONS' == request.method) {
        response.send(204);
    } 
    else {
        next();
    }
};

// Enable CORS in express
app.use(enableCORS);

// Fix problem wth nodejs reporting can't set headers after they are set
// http://stackoverflow.com/questions/7042340/node-js-error-cant-set-headers-after-they-are-sent
app.use(function (req, res, next) {
    var _send = res.send;
    var sent = false;
    res.send = function (data) {
        if (sent) return;
        _send.bind(res)(data);
        sent = true;
    }; next();
});

// Block request for mergeall and getchecksum when we are too busy
app.use(['*/api/CelerFTFileUpload/MergeAll*', '*/api/CelerFTFileUpload/GetChecksum*'], function (req, res, next) {
    if (toobusy()) {
        //res.send(503, "I'm busy right now, sorry.");
        res.status(503).send('I am busy right now, sorry.');
        res.end();
    } else { next(); }
});

app.use('*/api/CelerFTFileUpload/UploadChunk*', function (request, response, next) {
   
    // Check if we are being sent multipart/form-data or a custom x-file-name header.
    // multipart/form-data is sent when the browser uploads either a hand crafted form
    /// or we use the FormData object
    // x-file-header is sent when we use the NGINX client_body_in_file_only directive
    if (!(request.is('multipart/form-data') || request.headers['x-file-name'])) {
        
        response.status(415).send('Unsupported media type');
        return;
    }
    
    // Check that we have not exceeded the maximum chunk upload size
    var maxuploadsize = 51 * 1024 * 1024;
    
    if (request.headers['content-length'] > maxuploadsize) {
        
        response.status(413).send('Maximum upload chunk size exceeded');
        return;
    }
    
    // Get the extension from the file name
    response.locals.extension = path.extname(request.param('filename'));
    
    // Get the base file name
    response.locals.baseFilename = path.basename(request.param('filename'), response.locals.extension);
    
    // Create the temporary file name for the chunk
    response.locals.tempfilename = response.locals.baseFilename + '.' + request.param('chunkNumber').toString().padLeft('0', 16) + response.locals.extension + ".tmp";
    
    // Create the temporary directory to store the file chunk
    // The temporary directory will be based on the file name
    response.locals.tempdir = uploadpath + request.param('directoryname') + '/' + response.locals.baseFilename;
    
    // The path to save the file chunk
    response.locals.localfilepath = response.locals.tempdir + '/' + response.locals.tempfilename;
    
    if (fs.ensureDirSync(response.locals.tempdir)) {
        console.log('Created directory ' + response.locals.tempdir);
    }
    
    next();
});

// Serve up the Default.html page
app.use(express.static(__dirname, { index: 'Default.html' }));

// Startup the express.js application
app.listen(process.env.PORT || 1337);

// Path to save the files
if (process.env.uploadpath == undefined) {
    
    var uploadpath = 'C:/Uploads/CelerFT/';
    //var uploadpath = '/usr/share/nginx/html/CelerFT/Uploads/';
}
else {
    var uploadpath = process.env.uploadpath;
}


app.post('*/api/CelerFTFileUpload/UploadChunk/Base64*', function (request, response) {
        
    // Check if we have uploaded a hand crafted multipart/form-data request
    // If we have done so then the data is sent as a base64 string
    // and we need to extract the base64 string and save it
    if (request.headers['celerft-encoded'] === 'base64') {
        
        var fileSlice = new Buffer(+request.headers['content-length']);
        var bufferOffset = 0;
            
        // Get the data from the request
        request.on('data', function (chunk) {
            chunk.copy(fileSlice , bufferOffset);
            bufferOffset += chunk.length;
            
        }).on('end', function () {
                
            // Convert the data from base64 string to binary
            // base64 data in 4th indexof the array
            var base64data = fileSlice.toString().split('\r\n');
            var fileData = new Buffer(base64data[4].toString(), 'base64');
                
            // Save the file and create parent directory if it does not exist
            fs.outputFile(response.locals.localfilepath, fileData, function (err) {
                
                if (err) {
                    response.status(500).send(err);
                    return;
                }
                    
                // Send back a sucessful response with the file name
                response.status(200).send(response.locals.localfilepath);
                response.end();
                
            });

        });
    }

});

app.post('*/api/CelerFTFileUpload/UploadChunk/FormData*', function (request, response) {
    
    
    // The data is uploaded as binary data.
    // We will use formidable to extract the data and save it
    var form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.uploadDir = response.locals.tempdir;
    
    // Parse the form and save the file chunks to the
    // default location
    form.parse(request, function (err, fields, files) {
        
        if (err) {
            response.status(500).send(err);
            return;
        }

    });
    
    
    form.on('error', function (err) {
        if (err) {
            response.status(500).send(err);
            return;
        }
    });
    
    // After the files have been saved to the temporary name
    // move them to the to the correct file name.
    // Overwrite if necessary
    form.on('end', function (fields, files) {
        
        // Temporary location of our uploaded file        
        var temp_path = this.openedFiles[0].path;
        
        fs.move(temp_path , response.locals.localfilepath, {}, function (err) {
            
            if (err) {
                response.status(500).send(err);
                return;
            }
            
            // Send back a sucessful response with the file name
            response.status(200).send(response.locals.localfilepath);
            response.end();
                    
                
        });
            
    });

});

app.post('*/api/CelerFTFileUpload/UploadChunk/XFileName*', function (request, response) {
    
    
    // Check if we uploading using a x-file-header
    // This means that we have offloaded the file upload to the
    // web server (NGINX) and we are sending up the path to the actual
    // file in the header. The file chunk will not be in the body
    // of the request
    if (request.headers['x-file-name']) {
        
        // Temporary location of our uploaded file
        // Nginx uses a private file path in /tmp on Centos
        // we need to get the name of that path
        var temp_dir = fs.readdirSync('/tmp');
        var nginx_temp_dir = [];
        for (var i = 0; i < temp_dir.length; i++) {
            
            if (temp_dir[i].match('nginx.service')) {
                nginx_temp_dir.push(temp_dir[i]);
            }
        }
        
        var temp_path = '/tmp/' + nginx_temp_dir[0] + request.headers['x-file-name'];
        
        fs.move(temp_path , response.locals.localfilepath, {}, function (err) {
            
            if (err) {
                response.status(500).send(err);
                return;
            }
            
            // Send back a sucessful response with the file name
            response.status(200).send(response.locals.localfilepath);
            response.end();
                    
                
        });
    }

});

// Request to merge all of the file chunks into one file
app.get('*/api/CelerFTFileUpload/MergeAll*', function (request, response) {

    if (request.method == 'GET') {
        
        // Get the extension from the file name
        var extension = path.extname(request.param('filename'));
        
        // Get the base file name
        var baseFilename = path.basename(request.param('filename'), extension);
        
        var localFilePath = uploadpath + request.param('directoryname') + '/' + baseFilename;
        
        var filename = localFilePath + '/' + baseFilename + extension;
        
        // Array to hold files to be processed
        var files = [];
        
        // Use asynchronous readdir function to process the files
        // This provides better i/o
        fs.readdir(localFilePath, function (error, fileslist) {

            if (error) {
                
                response.status(400).send('Number of file chunks less than total count');
                //response.end();
                console.log(error);
                return;
            }
            
            //console.log(fileslist.length);
            //console.log(request.param('numberOfChunks'));
            

            if ((fileslist.length) != request.param('numberOfChunks')) {
                
                response.status(400).send('Number of file chunks less than total count');
                //response.end();
                return;
            }
            
            // Check if all of the file chunks have be uploaded
            // Note we only want the files with a *.tmp extension
            if ((fileslist.length) == request.param('numberOfChunks')) {

                for (var i = 0; i < fileslist.length; i++) {
                    if (path.extname(fileslist[i]) == '.tmp') {
                        //console.log(fileslist[i]);
                        files.push(fileslist[i]);
                    }
                }
                
                if (files.length != request.param('numberOfChunks')) {
                    response.status(400).send('Number of file chunks less than total count');
                    //response.end();
                    return;
                }
                
                // Create tthe output file
                var outputFile = fs.createWriteStream(filename);
                
                // Done writing the file. Move it to the top level directory
                outputFile.on('finish', function () {
                    
                    console.log('file has been written ' + filename);
                    //runGC();
                    
                    // New name for the file
                    var newfilename = uploadpath + request.param('directoryname') + '/' + baseFilename + extension;
                    
                    // Check if file exists at top level if it does delete it
                    // Use move with overwrite option
                    fs.move(filename, newfilename , {}, function (err) {
                        if (err) {
                            console.log(err);
                            response.status(500).send(err);
                            //runGC();
                            return;
                        }
                        else {
                            
                            // Delete the temporary directory
                            fs.remove(localFilePath, function (err) {
                                
                                if (err) {
                                    response.status(500).send(err);
                                    //runGC();
                                    return;
                                }
                                
                                // Send back a sucessful response with the file name
                                response.status(200).send('Sucessfully merged file ' + filename);
                        //response.end();
                        //runGC();
                        
                            });

                        // Send back a sucessful response with the file name
                        //response.status(200).send('Sucessfully merged file ' + filename + ", " + md5results.toUpperCase());
                        //response.end();
                    
                        }
                    });
                });
                                

                var index = 0;
                
                // Recrusive function used to merge the files
                // in a sequential manner
                var mergefiles = function (index) {
                    
                    // If teh index matches the items in the array
                    // end the function and finalize the output file
                    if (index == files.length) {
                        outputFile.end();
                        return;
                    }
                    
                    console.log(files[index]);
                    
                    // Use a read stream too read the files and write them to the write stream
                    var rstream = fs.createReadStream(localFilePath + '/' + files[index]);
                    
                    rstream.on('data', function (data) {
                        outputFile.write(data);
                    });
                    
                    rstream.on('end', function () {
                        //fs.removeSync(localFilePath + '/' + files[index]);
                        mergefiles(index + 1);
                    });
                    
                    rstream.on('close', function () {
                        fs.removeSync(localFilePath + '/' + files[index]);
                        //mergefiles(index + 1);
                    });
                    
                    rstream.on('error', function (err) {
                        console.log('Error in file merge - ' + err);
                        response.status(500).send(err);
                        return;
                    });
                };
                
                mergefiles(index);
            }
            /*else {
                response.status(400).send('Number of file chunks less than total count');
                //response.end();
                return;
            }*/
                

        });
    }


});

// Request the checksum of the file
app.get('*/api/CelerFTFileUpload/GetChecksum*', function (request, response) {
    
    if (request.method == 'GET') {
        
        // Get the extension from the file name
        //var extension = path.extname(request.param('filename'));
        
        // Get the base file name
        //var baseFilename = path.basename(request.param('filename'), extension);
        
        //var filename = uploadpath + request.param('directoryname') + '/' + baseFilename + extension;
        
        var filename = uploadpath + request.param('directoryname') + '/' + request.param('filename');
        
        // Check if the file exists
        if (!fs.statSync(filename)) {
            
            console.log('The file has not been created as yet - ' + filename);
            response.status(400).send('The file has not been created as yet - ' + filename);
            return;
        }
        
        // Create the MD5 hash of the file
        var hash = crypto.createHash('md5'), 
            hashstream = fs.createReadStream(filename);
        
        hashstream.on('data', function (data) {
            hash.update(data)
        });
        
        hashstream.on('end', function () {
            
            var md5results = hash.digest('hex');
            console.log('Hash for file ' + filename + ' - ' + md5results.toUpperCase());           
            // Send back a sucessful response with the file name
            response.status(200).send('Sucessfully generated checksum ' + filename + ", " + md5results.toUpperCase());
            response.end();
   
        });
       
    }

});

// String padding left code taken from 
// http://www.lm-tech.it/Blog/post/2012/12/01/String-Padding-in-Javascript.aspx

String.prototype.padLeft = function (paddingChar, length) {
    var s = new String(this);
    if ((this.length < length) && (paddingChar.toString().length > 0)) {
        for (var i = 0; i < (length - this.length) ; i++) {
            s = paddingChar.toString().charAt(0).concat(s);
        }
    }
    
    return s;
};


// Get files with a give extension. Based on StackOverflow answer
function getfilesWithExtensionName(dir, ext) {
    

    var matchingfiles = [];
    
    if (fs.ensureDirSync(dir)) {
        return matchingfiles;
    }
    
    var files = fs.readdirSync(dir);
    for (var i = 0; i < files.length; i++) {
        if (path.extname(files[i]) === '.' + ext) {
            matchingfiles.push(files[i]);
        }
    }
    
    return matchingfiles;
    
}

// http://promincproductions.com/blog/nodejs-handling-memory-issues-enomem-garbage-collection/
function runGC() {
    
    if (typeof global.gc != "undefined") {
        // console.log("Mem Usage Pre-GC "+util.inspect(process.memoryUsage()));
        global.gc();
        // console.log("Mem Usage Post-GC "+util.inspect(process.memoryUsage()));
    }
}