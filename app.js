//. app.js
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    ejs = require( 'ejs' ),
    fs = require( 'fs' ),
    multer = require( 'multer' ),
    app = express();

var my_s2t = require( './my_s2t' );

var settings = require( './settings' );

app.use( multer( { dest: './tmp/' } ).single( 'voice' ) );
app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

//.  HTTP server
var http = require( 'http' ).createServer( app );
var io = require( 'socket.io' )( http );

//. S2T
var s2t_params = {
  objectMode: true,
  contentType: 'audio/mp3',
  model: settings.s2t_model,
  smartFormatting: true,
  speakerLabels: true,
  inactivityTimeout: -1,
  interimResults: true,
  timestamps: true,
  maxAlternatives: 3
};

//. Page for client
app.get( '/', function( req, res ){
  res.render( 'index', {} );
});

app.get( '/files', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var files = [];
  var _files = fs.readdirSync( './public' );
  for( var i = 0; i < _files.length; i ++ ){
    if( _files[i].endsWith( '.mp3' ) || _files[i].endsWith( '.flac' ) ){
      files.push( _files[i] );
    }
  }

  res.write( JSON.stringify( { status: true, files: files }, 2, null ) );
  res.end();
});

app.post( '/voice', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var voice = req.body.voice;
  var uuid = req.body.uuid;
  var voicefile = './public/' + voice;

  processAudioFile( voicefile, uuid ).then( function( result ){
    res.write( JSON.stringify( { status: true }, 2, null ) );
    res.end();
  }).catch( function( err ){
    console.log( err );
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
    res.end();
  })
});

app.post( '/setcookie', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var value = req.body.value;
  //console.log( 'value = ' + value );
  res.setHeader( 'Set-Cookie', value );

  res.write( JSON.stringify( { status: true }, 2, null ) );
  res.end();
});

async function processAudioFile( filepath, uuid, deleteFileWhenFinished ){
  return new Promise( async function( resolve, reject ){
    var s2t_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_params );
    fs.createReadStream( filepath ).pipe( s2t_stream );
    s2t_stream.on( 'data', function( evt ){
      //console.log( JSON.stringify( evt ) );
      sockets[uuid].emit( 'event_client_view', evt ); 
      if( evt.results && evt.results[0] && evt.results[0].final ){
        /* ????????????????????????
        {
          result_index: 0,
          results: [
            { 
              final: true,
              alternatives: [
                {  //. ?????????
                  transcript: "???????????????????????????????????????????????????????????????????????????????????????????????????",
                  confidence: 0.95,
                  timestamps: [
                    [ "??????", 0.36, 0.84 ],
                    [ "???????????????", 0.84, 1.35 ],
                    [ "???", 1.35, 1.59 ],
                       :
                    [ "??????", 4.13, 4.7 ]
                  ]
                },
                {  //. ?????????
                  :
                }
              ]
            }
          ]
        }
        */
        var idx = evt.result_index;
        var text = evt.results[0].alternatives[0].transcript;
        text = text.split( ' ' ).join( '' );
        //console.log( 'text = ' + text );
      }else if( evt.speaker_labels && evt.speaker_labels[0] && evt.speaker_labels[0].from ){
        /* ????????????????????????
        {
          speaker_labels: [
            { 
              from: 0.36,
              to: 0.84,
              speaker: 0,
              confidence 0.67,
              final: false
            },
            {
              from: 0.84,
              to: 1.35,
              speaker: 0,
              confidence: 0.67,
              final: false
            },
              :
            {
              from: 4.13,
              to: 4.7,
              speaker: 1,
              confidence: 0.67,
              final: false
            }
          ]
        }
        */
      }
    });
    s2t_stream.on( 'error', function( evt ){
      console.log( 's2t_stream:error', evt );
      if( deleteFileWhenFinished ){
        fs.unlinkSync( filepath );
      }
      reject( evt );
    });
    s2t_stream.on( 'close', function( evt ){
      //console.log( 's2t_stream:close', evt );
      if( deleteFileWhenFinished ){
        fs.unlinkSync( filepath );
      }
      resolve( true );
    });
  });
}


//. socket.io
var sockets = {};
io.sockets.on( 'connection', function( socket ){
  console.log( 'connected.' );

  //. ??????????????????????????????????????? resized ??????
  socket.on( 'init_client', function( msg ){
    //console.log( 'init_client', msg );

    //. ????????????????????????????????????????????????????????????????????????????????? connection ?????? socket ?????????????????????
    if( !sockets[msg.uuid] ){
      sockets[msg.uuid] = socket;
    }

    //. init_client ?????????????????????????????????????????? init_client_view ?????????
    sockets[msg.uuid].emit( 'init_client_view', msg ); 
  });
});


var port = process.env.PORT || 8080;
http.listen( port );
console.log( "server starting on " + port + " ..." );
