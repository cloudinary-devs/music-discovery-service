const cloudinary = require('cloudinary');
const cmg_archives = require('cloudinary');
const express = require('express');
const Webtask = require('webtask-tools');
const bodyParser = require('body-parser');
const request = require('request');
const JSONP = require('node-jsonp');
const Algorithmia = require('algorithmia');
const Api7digital = require('7digital-api');
const axios = require('axios');
const md5 = require('md5');

var app = express();

var algorithmia_key,rovi_metasearch_api_key, roviSignature, musicmatch_api_key,api, artists, tracks, releases , consumerkey, consumersecret;

app.use(bodyParser.json());


//Rovi Signature Utility 
function genRoviSig(context) {
    var apikey = context.secrets.rovi_metasearch_api_key;
    var secret = context.secrets.rovi_metasearch_api_secret;
    console.log(apikey,secret);
    rovi_metasearch_api_key = apikey;
    var curdate = new Date();
    var gmtstring = curdate.toGMTString();
    var utc = Date.parse(gmtstring) / 1000;
    return  md5(apikey + secret + utc);
}

// Our Middleware to setup API 
var apiContext = function (req, res, next) {
  const context = req.webtaskContext;

  // config cloudinary  
  cloudinary.config({
      "cloud_name": context.secrets.cloudinary_cloud_name,
      "api_key": context.secrets.cloudinary_api_key,
      "api_secret": context.secrets.cloudinary_api_secret
    });

var cmg_cloudEnv = context.secrets.cmg_cloud;

let cmgcloud = cmg_cloudEnv.split('@')[1];
let cmg_api = cmg_cloudEnv.split('@')[0].split('//')[1].split(':')[0];
let cmg_secret = cmg_cloudEnv.split('@')[0].split('//')[1].split(':')[1];

 // config CMG cloudinary  
  cmg_archives.config({
      "cloud_name": cmgcloud,
      "api_key": cmg_api,
      "api_secret": cmg_secret
    });


  // paging 
  const page = context.query.page || 1;
  const pageSize = context.query.pageSize || 100;
  
  //roviSignature 
  roviSignature = genRoviSig(context);
  // console.log('Rovi Sig: ',roviSignature);
  // console.log('Rovi rovi_metasearch_api_key: ',rovi_metasearch_api_key);
  
  
  //Algorithmia key
  algorithmia_key = context.secrets.algorithmia_key;
  
  
  //Music Match
  musicmatch_api_key = context.secrets.musicmatch_api_key;
  
  // 7digital-api
  consumerkey = context.secrets.seven_digital_oauth_consumer_key;
  consumersecret =  context.secrets.seven_digital_oauth_consumer_secret;

  api = Api7digital.configure({
	  format: 'JSON',
	  consumerkey: context.secrets.seven_digital_oauth_consumer_key,
	  consumersecret: context.secrets.seven_digital_oauth_consumer_secret,
	  defaultParams: { 
	      country: 'GB', 
        shopId: context.secrets.seven_digital_shop_id,
	      usageTypes: 'adsupportedstreaming',  
	      pageSize: pageSize, 
	      page:page, 
	      imageSize:800,
	      sort: 'popularity desc'
	  }
});

// create instances of individual apis
  artists = new api.Artists();
  releases = new api.Releases();
  tracks = new api.Tracks();
  console.log('API Inited.')
  next()
}

// Use our API Middleware
app.use(apiContext)




async function getMetaSeq(params){
try{
 
   let songInfoURL = "http://api.rovicorp.com/data/v1.1/song/info"
   let songInfoOptions = {
          validateStatus: function (status) { return status < 500;},
          params: {
            isrcid: params.isrc,
            include:"moods,themes,review,appearances",
            country:"us",
            language:"en",
            format:"json",
            apikey: rovi_metasearch_api_key,
            sig:roviSignature
            }};
            
             
    let meta = await axios.get(songInfoURL, songInfoOptions)
  // console.log(meta.data.song);
  //Mandatory field: amgpopid or album or amgclassicalid or albumid.
  let albumInfoURL = "http://api.rovicorp.com/data/v1.1/album/info"
  let albumInfoOptions = {
          validateStatus: function (status) { return status < 500;},
          params: {
            album: meta.data.song.appearances[0].ids.albumId,
            include:"moods,themes,images,primaryreview,styles,themes,credits",
            country:"us",
            language:"en",
            format:"json",
            apikey: rovi_metasearch_api_key,
            sig:roviSignature
            }};


             
    let album = await axios.get(albumInfoURL, albumInfoOptions)
    console.log(album.data.album);
    
    let nameid = ( meta.data.song) ? meta.data.song.primaryArtists[0].id : null;
  
          let artistInfoURL = "http://api.rovicorp.com/data/v1.1/name/info"
          let artistInfoOptions = {
             validateStatus: function (status) { return status < 500;},
                  params: {
                    nameid: nameid,
                    include:"images",
                    country:"us",
                    language:"en",
                    formatid:"62",
                    format:"json",
                    apikey: rovi_metasearch_api_key,
                    sig:roviSignature
                    }};
       
      
      
  let artist = await axios.get(artistInfoURL, artistInfoOptions)
  
  //console.log(artist.data.name);
  
  // convenience kv
  //song
  var moods = ( meta.data.song && meta.data.song.moods) ? meta.data.song.moods.map((value) => value.name):null;
  var themes = (meta.data.song && meta.data.song.themes) ? meta.data.song.themes.map((value) => value.name):null;
  var genres = (meta.data.song && meta.data.song.genres) ? meta.data.song.genres.map((value) => value.name):null;
  //artist
  var active = (meta.data.name && artist.data.name.active) ? artist.data.name.active: null;
  var images = (meta.data.name && artist.data.name.images) ? artist.data.name.images: null;
            
  var result = {images:images, isrc:params.isrc,active:active, genres:genres, themes: themes, moods: moods, song:meta.data.song, artist: artist.data.name, album:album.data.album}
            //  console.log(result);
              return await result;
  }
  catch (error){
    console.log(error); 
    return await error;
  }      
}

app.get('/meta/:isrc', function (req, res) {
  var isrc = req.params.isrc  || 'USBN29801012'; 
  const context = req.webtaskContext;

  const data = { isrc: isrc };
  getMetaSeq(data)
  .then(function(meta){
       console.log('success')
        res.send(meta);
  })
  .catch(function(error){
          console.log('error')
          res.send(error);
          //res.sendStatus(error) 
  });
});


/*end */

var getLyrics = function(params){
  
  const data = {
    format:'jsonp',
    callback: 'callback',
    q_track: params.q_track,
    q_artist: params.q_artist,
    track_isrc: params.track_isrc,
    apikey: musicmatch_api_key
  };
  
  // musixmatch api
  const url = 'https://api.musixmatch.com/ws/1.1/matcher.lyrics.get';
  return new Promise(function (resolve, reject) {
  
  JSONP(url,data,'callback',function(response){
     console.log(response.message.body);
     const lyrics =  response.message.body.lyrics;
       if(lyrics){
         resolve(lyrics);  
       }else{
         reject("There was an error getting lyrics");
       }
    });
    
  });
  
}

// USMC14673497  
// 'USCJ81000500'// 'GBAFL1700342';  //?Spacewoman

app.get('/lyrics/:isrc', function (req, res) {
  var track_isrc = req.params.isrc  || 'GBAFL1700342'; 
  const context = req.webtaskContext;

  const data = { track_isrc: track_isrc };

   getLyrics(data)
   .then(function(lyrics){
  
    Algorithmia.client(algorithmia_key)
    .algo("nlp/AutoTag/1.0.1")
    .pipe(lyrics.lyrics_body)
    .then(function(response) {
        console.log(response.get());
        var lyrics_body = lyrics.lyrics_body.replace('******* This Lyrics is NOT for Commercial use *******','');
        var results = { words:response.get(), lyrics: lyrics_body};
        res.send(results);
    });
    
          
   })
   .catch(function(error){
          res.send(error);
   });
});


var getSong = function(context, trackid){
// Create a Signed URL
var oauth = new api.OAuth();
    return new Promise(function (resolve, reject) {
       var apiUrl = 'https://stream.svc.7digital.net/stream/catalogue?country=GB&trackid=' + trackid;
       var signedURL = oauth.sign(apiUrl);
       if(signedURL){
          console.log(signedURL)
          resolve({url:signedURL});
       }else{
          reject('we had an error');
       }
      });
}

// /song/70540913/stream/

/*
https://canadian-music-week.cloudinary.auth0-extend.com/music-discovery-service/song/40349901/stream
*/

app.get('/song/:trackid/?:stream', function ( req, res) {
  
  const trackid = req.params.trackid  || '123456';  // /song/12345
  const context = req.webtaskContext;
  const shouldStream = req.params.stream  || "url";
  console.log(trackid);
  console.log(shouldStream);
  
  getSong(context, trackid).then(function(data){
    
      if(shouldStream == 'stream'){
        request(data.url).pipe(res);
      }else{
        res.send( data);   
      }
   }).catch(function(err){
      console.log('ERR:', Err);
      res.send(err);
   })
  
});



var getClip = function(trackid){
  
    return new Promise(function (resolve, reject) {
      var clipUrl = 'http://previews.7digital.com/clip/' + trackid;
      const oauth = new api.OAuth();
      var previewUrl = oauth.sign(clipUrl);
       if(previewUrl){
          resolve({ url:previewUrl });
       }else{
          reject('we had an error');
       }
      });
}
 
 // /song/70540913/stream/
 
 /*
  "id": "40349901",
        "title": "First Time",
        https://canadian-music-week.cloudinary.auth0-extend.com/music-discovery-service/clip/40349901/stream
 */

 app.get('/clip/:trackid/?:stream', function ( req, res) {
  var trackid = req.params.trackid || '40349901';   // /clip/12345
  const context = req.webtaskContext;
  const shouldStream = req.params.stream  || "url";
  
  getClip(trackid)
  .then(function(data){
      if(shouldStream == 'stream'){
        request(data.url).pipe(res);
      }else{
        res.send( data);   
      }
   })
   .catch(function(err){
      console.log('ERR:', err);
      res.send(err);
   })
  
});

 
var browse = function(letter) {  
  return new Promise(function (resolve, reject) {
       artists.browse({ letter: letter }, function(err, data) {
              if(err){
               reject(err)
              }
              if(data){
                resolve(data);
              } 
            });    
  });
}
app.get('/browse/:letter', function ( req, res) {
  const letter = req.params.letter;   // /browse/letter

  browse(letter).then(function(data){
        console.log(JSON.stringify(data,null,5));
        res.send( data);   
   }).catch(function(error){
      console.log('error:', error);
      res.send(error);
   })
  
});
  
  
  var search = function(query) {  
  return new Promise(function (resolve, reject) {
        artists.search({ q: query }, function(err, data) {
        if(err){
          console.log(err);
            reject(err)
        }
        if(data){
          console.log(JSON.stringify(data,null,5));
          resolve(data);
        } 
      });
  })
}
  
// Neil Diamond  35
app.get('/search/:query', function ( req, res) {
  const query = req.params.query || 1;
  search(query).then(function(data){
        res.send( data);   
   })
   .catch(function(error){
      console.log('error: ', error);
      res.send(error);
   })
});
  
  
  //14643 The Breeders
  // ZEDD 819457
  // Album clarity 1960305
  // track hourglass 21258162

var getReleases = function(artistID) {  
  return new Promise(function (resolve, reject) {
    
        artists.getReleases({ artistid: artistID }, function(err, data) {
        if(err){
          console.log(err);
            reject(err)
        }
        if(data){
          console.log(data);
          resolve(data);
        } 
      });
  })
}
    
// artistid     
app.get('/releases/:artistid', function ( req, res) {
const artistid = req.params.artistid || '14643';
  getReleases(artistid)
  .then(function(data){
        res.send( data);   
   }).catch(function(error){
      console.log('error:', error);
      res.send(error);
   })
});


// Save Cover Image 

var uploadImage = function(coverImageURL, public_id){
return  new Promise(function (resolve, reject) {
  var url = coverImageURL || 'http://res.cloudinary.com/de-demo/video/upload/v1520429530/test-audio.mp3' ; 
   
        // uses upload preset:  https://cloudinary.com/console/settings/upload
        cloudinary.v2.uploader.upload(url, 
              { 
              upload_preset: 'sxsw',  
              public_id: public_id,  
              type: "upload",
              resource_type: "image", 
              }, 
          function(error, result) {
            if(error){
                   reject( error);
            }
            if(result){
              console.log(result);
                    resolve(result);
            }
          });
        });
}


app.get('/upload', function ( req, res) {
  
var url = req.params.url || 'http://artwork-cdn.7static.com/static/img/sleeveart/00/055/149/0005514991_800.jpg';

///'http://artwork-cdn.7static.com/static/img/artistimages/00/000/113/0000011319_300.jpg';

var public_id = req.params.publicid || 'Cyndi_Lauper_cover';

console.log(url, public_id);


// res.send({url:url, public_id:public_id}); 

  uploadImage(url,public_id)
  .then(function(data){
        res.send(data);   
  }).catch(function(error){
      console.log('error:', error);
      res.send(error);
  })
});


var getImagesByTags = function(tags){
return  new Promise(function (resolve, reject) {
           cloudinary.v2.api.resources_by_tag(tags,{max_results:100, tags:true}, 
           function(error, result){
             if(error){
               reject(error);
             }
             if(result){
               console.log(result);
               resolve(result);
             }
           });

        });
}






// Get tracks by releaseID: 
// "id": "3885814",
//        "title": "Melody Road",
var getTracks = function(releaseid) {  
  return new Promise(function (resolve, reject) {
        releases.getTracks({ releaseid: releaseid }, function(err, data) {
        if(err){
          console.log(err);
            reject(err)
        }
        if(data){
          resolve(data);
        } 
      });
  })
}





// Get tracks by releaseID: 7026306
// /releases/819457  // ZEDD
//1960305 //clarity
app.get('/tracks/:releaseid', function ( req, res ) {
  
  const releaseid = req.params.releaseid || '7026306';
    console.log(releaseid);
    getTracks(releaseid)
    .then(function(data){
      console.log(JSON.stringify(data,null,5));
      res.send(data); 
    }).catch(function(error){
       res.send(error);
    });
    
});


var iterateTracks = function(data) {  
  var tracks = data.tracks.track;
  return new Promise(function (resolve, reject) {
    let rs = tracks.map(function(track){
        return track.isrc;
     });
      resolve(rs);
  })
}    

var updateTracks = function(isrc) {  
  return new Promise(function (resolve, reject) {
  const data = { isrc: isrc };
  getMetaSeq(data)
  .then(function(meta){
       console.log('success')
        resolve(meta);
  })
  .catch(function(error){
          console.log('error')
          reject(error);
  });
  })
}

app.get('/test/:releaseid', function ( req, res ) {
  const releaseid = req.params.releaseid || '7026306';
    console.log(releaseid);
    getTracks(releaseid)
    .then (function(data){
        return iterateTracks(data);
    })
     .then(function(data){
     console.log(JSON.stringify(data,null,5));
        res.send(data); 
    }).catch(function(error){
       res.send(error);
    });
    
  
});


var getArchivesByTag = function(tag) {  
  return new Promise(function (resolve, reject) {
        cloudinary.v2.api.tags(function(error, result){
            if(error){
                reject(error);
            }
            
            if(result){
                  console.log(result);
                  resolve(result);
            }
        });
  })
}



app.get('/archives/:tag', function ( req, res ) {
  const tag = req.params.tag || 'cover-image';
    console.log(releaseid);
    getArchivesByTag(tag)
     .then(function(data){
     console.log(JSON.stringify(data,null,5));
        res.send(data); 
    }).catch(function(error){
       res.send(error);
    });
    
  
});




app.get('/', function (req, res) {
  const html = `<a href="https://bit.ly/cil-guide">Hackathon Guide<a>`;
    res.send(html); 
  // res.sendStatus(200);
});




module.exports = Webtask.fromExpress(app);
