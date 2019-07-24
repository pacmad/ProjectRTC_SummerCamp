(function(){
    var app = angular.module('projectRtc', ['ngRoute', 'ngMaterial', 'ngMessages'],
        function($locationProvider){$locationProvider.html5Mode(true);}
    );

    var client = new PeerManager();
    var mediaConfig = {
        audio:true,
        video: {
            mandatory: {},
            optional: []
        }
    };

    app.config(function ($routeProvider) {
       $routeProvider.when(
           '/', {templateUrl: 'htmls/home.html'}
       ).when(
           '/view', {templateUrl: 'htmls/stream-view.html'}
       ).when(
           '/gps', {templateUrl: 'htmls/stream-gps.html'}
       )
    });

    app.factory('camera', ['$rootScope', '$window', function($rootScope, $window){
        var camera = {};
        camera.preview = $window.document.getElementById('localVideo');

        camera.start = function(){
            return requestUserMedia(mediaConfig)
                .then(function(stream){
                    attachMediaStream(camera.preview, stream);
                    client.setLocalStream(stream);
                    camera.stream = stream;
                    $rootScope.$broadcast('cameraIsOn',true);
                })
                .catch(Error('Failed to get access to local media.'));
        };
        camera.stop = function(){
            return new Promise(function(resolve, reject){
                try {
                    //camera.stream.stop() no longer works
                    for( var track in camera.stream.getTracks() ){
                        track.stop();
                    }
                    camera.preview.src = '';
                    resolve();
                } catch(error) {
                    reject(error);
                }
            })
                .then(function(result){
                    $rootScope.$broadcast('cameraIsOn',false);
                });
        };
        return camera;
    }]);

    app.controller('RemoteStreamsController', ['camera', '$location', '$http', '$scope','$rootScope', function(camera, $location, $http, $scope, $rootScope){
        var rtc = this;
        rtc.remoteStreams = [];

        function getStreamById(id) {
            for(var i=0; i<rtc.remoteStreams.length;i++) {
                if (rtc.remoteStreams[i].id === id) {return rtc.remoteStreams[i];}
            }
        }

        rtc.loadData = function () {
            // get list of streams from the server
            $http.get('/streams.json').success(function(data){
                // filter own stream
                var streams = data.filter(function(stream) {
                    return stream.id != client.getId();
                });
                // get former state
                for(var i=0; i<streams.length;i++) {
                    var stream = getStreamById(streams[i].id);
                    streams[i].isPlaying = (!!stream) ? stream.isPLaying : false;
                }
                // save new streams
                rtc.remoteStreams = streams;
            });
        };

        $rootScope.$on("back", function (event, msg) {
            $scope.remoteStreamsIfShow = true;
        })

        rtc.view = function(stream){
            console.log('hi')
            $scope.remoteStreamsIfShow = false;
            $rootScope.$broadcast("view",stream);
        };

        rtc.call = function(stream){
            /* If json isn't loaded yet, construct a new stream
             * This happens when you load <serverUrl>/<socketId> :
             * it calls socketId immediatly.
            **/
            if(!stream.id){
                stream = {id: stream, isPlaying: false};
                rtc.remoteStreams.push(stream);
            }
            if(camera.isOn){
                client.toggleLocalStream(stream.id);
                if(stream.isPlaying){
                    client.peerRenegociate(stream.id);
                } else {
                    client.peerInit(stream.id);
                }
                stream.isPlaying = !stream.isPlaying;
            } else {
                camera.start()
                    .then(function(result) {
                        client.toggleLocalStream(stream.id);
                        if(stream.isPlaying){
                            client.peerRenegociate(stream.id);
                        } else {
                            client.peerInit(stream.id);
                        }
                        stream.isPlaying = !stream.isPlaying;
                    })
                    .catch(function(err) {
                        console.log(err);
                    });
            }
        };

        //initial load
        rtc.loadData();
        if($location.url() != '/'){
            rtc.call($location.url().slice(1));
        };
    }]);

    app.controller('DetailController',['camera', '$location', '$http', '$scope','$rootScope', function(camera, $location, $http, $scope, $rootScope){
        var detail = this;
        var remoteStream;

        $scope.detailIfShow = false;
        $rootScope.$on("view", function (event, stream) {
            remoteStream = stream;


            $scope.detailIfShow = true;
            console.log("client.id", client.getId());
            console.log("stream.id",stream.id);
            console.log(event);
            detail.viewStream(stream)
        })

        detail.viewStream = function (stream) {
            client.peerInit(stream.id);
            stream.isPlaying = !stream.isPlaying;
            $scope.functions = ['Screen','GPS', 'Camera'];
            client.createDataChannel(remoteStream.id);
        }

        detail.back = function () {
            $scope.detailIfShow = false;
            $rootScope.$broadcast("back","back to remote-streams.ejs");
        }

        detail.sendData = function () {
            //client.createDataChannel(remoteStream.id);
            var textArea = document.getElementById("sendInfo");
            var info = textArea.value;

            client.sendDataByChannel(info);
            //client.sendData(info, remoteStream.id);
        }
    }]);

    app.controller('LocalStreamController',['camera', '$scope', '$window', function(camera, $scope, $window){
        var localStream = this;
        localStream.name = 'Guest';
        localStream.link = '';
        localStream.cameraIsOn = false;

        $scope.$on('cameraIsOn', function(event,data) {
            $scope.$apply(function() {
                localStream.cameraIsOn = data;
            });
        });

        localStream.toggleCam = function(){
            if(localStream.cameraIsOn){
                camera.stop()
                    .then(function(result){
                        client.send('leave');
                        client.setLocalStream(null);
                    })
                    .catch(function(err) {
                        console.log(err);
                    });
            } else {
                camera.start()
                    .then(function(result) {
                        localStream.link = $window.location.host + '/' + client.getId();
                        client.send('readyToStream', { name: localStream.name });
                    })
                    .catch(function(err) {
                        console.log(err);
                    });
            }
        };
    }]);
    
    app.controller('GPSController',['$location', '$http', '$scope','$rootScope', '$window',function ($location, $http, $scope, $rootScope, $window) {
        $window.onload = function () {
            
            var map = new BMap.Map("allmap");
            var point = new BMap.Point(116.404, 39.915);
            map.centerAndZoom(point, 15);
            function addMarker(point){
                var marker = new BMap.Marker(point);
                map.addOverlay(marker);
            }
            addMarker(point)
        }
    }])
})();