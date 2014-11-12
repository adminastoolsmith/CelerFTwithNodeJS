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
var app = express();

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

// Serve up the Default.html page
app.use(express.static(__dirname, { index: 'Default.html' }));

// Startup the express.js application
app.listen(process.env.PORT || 1337);

// Path to save the files
if (process.env.uploadpath == undefined) {
    var uploadpath = 'C:/Uploads/CelerFT/';
}
else {
    var uploadpath = process.env.uploadpath;
}

// Use the post method for express.js to respond to posts to the uploadchunk urls and
// save each file chunk as a separate file
app.post('*/api/CelerFTFileUpload/UploadChunk*', function (request, response) {
    
    if (request.method === 'POST') {
        
        // Check Content-Type    
        if (!(request.is('multipart/form-data'))) {
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
        var extension = path.extname(request.param('filename'));
        
        // Get the base file name
        var baseFilename = path.basename(request.param('filename'), extension);
        
        // Create the temporary file name for the chunk
        var tempfilename = baseFilename + '.' + request.param('chunkNumber').toString().padLeft('0', 16) + extension + ".tmp";
        
        // Create the temporary directory to store the file chunk
        // The temporary directory will be based on the file name
        var tempdir = uploadpath + request.param('directoryname') + '/' + baseFilename;
        
        // The path to save the file chunk
        var localfilepath = tempdir + '/' + tempfilename;
        
        if (fs.ensureDirSync(tempdir)) {
            console.log('Created directory ' + tempdir);
        }
        
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
                fs.outputFile(localfilepath, fileData, function (err) {
                    
                    if (err) {
                        response.status(500).send(err);
                        return;
                    }
                    
                    // Send back a sucessful response with the file name
                    response.status(200).send(localfilepath);
                    response.end();
                
                });

            });
        }
        else {
            
            // The data is uploaded as binary data.
            // We will use formidable to extract the data and save it
            var form = new formidable.IncomingForm();
            form.keepExtensions = true;
            form.uploadDir = tempdir;
            
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
                
                fs.move(temp_path , localfilepath, true, function (err) {
                    
                    if (err) {
                        response.status(500).send(err);
                        return;
                    }
                    
                    // Send back a sucessful response with the file name
                    response.status(200).send(localfilepath);
                    response.end();
                    
                
                });
            
            });

        // Send back a sucessful response with the file name
        //response.status(200).send(localfilepath);
        //response.end();
        }
        
        
    }

});


// Request to merge all of the file chunks into one file
app.get('*/api/CelerFTFileUpload/MergeAll*', function (request, response) {

    if (request.method === 'GET') {
        
        // Get the extension from the file name
        var extension = path.extname(request.param('filename'));
        
        // Get the base file name
        var baseFilename = path.basename(request.param('filename'), extension);
        
        var localFilePath = uploadpath + request.param('directoryname') + '/' + baseFilename;

        // Check if all of the file chunks have be uploaded
        // Note we only wnat the files with a *.tmp extension
        var files = getfilesWithExtensionName(localFilePath, 'tmp')
        
        if ((typeof files == "undefined") || (files.length != request.param('numberOfChunks'))) {
            
            response.status(400).send('Number of file chunks less than total count');
            return;
        }
        
        var filename = localFilePath + '/' + baseFilename + extension;
        var outputFile = fs.createWriteStream(filename);
        
        // Done writing the file
        // Create the MD5 hash and then move to top level directory

        outputFile.on('finish', function () {

            console.log('file has been written ' + filename);
            
            // Create MD5 hash
            var hash = crypto.createHash('md5'), 
                hashstream = fs.createReadStream(filename);
            
            hashstream.on('data', function (data) {
                hash.update(data)
            });
            
            hashstream.on('end', function () {
                
                var md5results = hash.digest('hex');
                
                // Rename the file and move it to the top level directory
                
                // New name for the file
                var newfilename = uploadpath + request.param('directoryname') + '/' + baseFilename + extension;
                
                // Check if file exists at top level if it does delete it
                // Use move with overwrite option
                fs.move(filename, newfilename , true, function (err) {
                    if (err) {
                        response.status(500).send(err);
                        return;
                    }
                    else {
                        
                        // Delete the temporary directory
                        fs.remove(localFilePath, function (err) {
                            
                            if (err) {
                                response.status(500).send(err);
                                return;
                            }
                            
                            // Send back a sucessful response with the file name
                            response.status(200).send('Sucessfully merged file ' + filename + ", " + md5results.toUpperCase());
                            response.end();
                        
                        });

                        // Send back a sucessful response with the file name
                        //response.status(200).send('Sucessfully merged file ' + filename + ", " + md5results.toUpperCase());
                        //response.end();
                    
                    }
                });
   
            });
            
        });
        
        // Loop through the file chunks and write them to the file
        // files[index] retunrs the name of the file.
        // we need to add put in the full path to the file
        for (var index in files) {
            
            console.log(files[index]);
            var data = fs.readFileSync(localFilePath + '/' + files[index]);
            outputFile.write(data);
            fs.removeSync(localFilePath + '/' + files[index]);
        }

        outputFile.end();
       
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