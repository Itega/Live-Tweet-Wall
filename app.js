const streamToPromise = require('stream-to-promise')
const scrapeTwitter = require('scrape-twitter')
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const moment = require("moment");
const FixedQueue = require("./lib/FixedQueue");
const config = require("./config.json");
const {TweetStream, getUserProfile} = scrapeTwitter;

app.use(express.static(__dirname + "/frontend"));

app.get('/', function(req, res, next) {
    res.sendFile(__dirname + '/frontend/index.html');
});

let toShow = [];
let showed = FixedQueue(30);

function checkTweet() {
    streamToPromise(new TweetStream(config.hashtag, 'latest', {
        count: 10
    })).then(tweets => {
        tweets.forEach((tweet) => {
            getUserProfile(tweet.screenName).then((user)=>{
                let text = [];
                tweet.text.replace(/\n|\r/g, " ").split(' ').forEach((word) => {
                    if(word.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, '').startsWith('#'))
                        text.push("<span class='hashtag'>" + word + "</span>");
                    else {
                        if(word.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, '').startsWith('@'))
                            text.push("<span class='mention'>" + word + "</span>");
                        else {
                            if (word.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, '').startsWith('http://') || word.replace(/(\r\n|\n|\r)/gm, "").startsWith('https://'))
                                text.push("<span class='link'>" + word.split(' ')[0] + "</span>");
                            else
                                text.push(word);
                        }
                    }
                });
                let html = "<div class='tweet card box-shadow'>" +
                    "        <div class='card-header d-flex align-items-center'>" +
                    "            <img class='card-img-left' src='https://avatars.io/twitter/" + tweet.screenName + "' width='70px' height='70px'>" +
                    "            <div class='d-flex justify-content-between align-items-center'>" +
                    "                <div>" +
                    "                    <h3 class='card-text p-2'>" + user.name + "</h3>" +
                    "                    <span class='text-muted ml-auto p-2'>" + moment(new Date(tweet.time)).format('HH:mm') + "</span>" +
                    "                </div>" +
                    "                <div style='display: flex; flex-direction: column; justify-content: center; align-items: center'>" +
                    "                    <p><span class='icon ion-loop'></span> : " + tweet.retweetCount + "</p>" +
                    "                    <p><span class='icon ion-heart'></span> : " + tweet.favoriteCount + "</p>" +
                    "                </div>\n" +
                    "            </div>\n" +
                    "        </div>\n" +
                    "        <div class='card-body'>\n" +
                    "            <p class='card-text'>" + text.join(" ") + "</p>" +
                    "            <div class='images'>";
                tweet.images.forEach((url) => {
                    html = html + "<img src='https://images.weserv.nl/?w=400&url=" + encodeURIComponent(url.split("https://")[1]) + "&il' /> "
                });
                html = html +    "            </div>" +
                    "        </div>" +
                    "    </div>"

                if(shouldAddTweet(tweet.id) && shouldShowTweet(tweet.id) && checkBanWord(tweet.text) && checkBanUser(tweet.screenName))
                    toShow.push({key: tweet.id, html: html, date: tweet.time});
            });
        });
    })
}

function checkBanWord(str){
    let isOk = true;
    config.bannedWords.forEach((word) => {
        if(str.includes(word))
            isOk = false;
    });
    return isOk;
}

function checkBanUser(name){
    let isOk = true;
    config.bannedUsers.forEach((user) => {
        if(user === name)
            isOk = false;
    });
    return isOk;
}

function shouldAddTweet(tweetId){
    let shouldAdd = true;
    for (let i = 0; i < toShow.length; i++)
        if (toShow[i].key === tweetId)
            shouldAdd = false;

    return shouldAdd;
}

function shouldShowTweet(tweetId){
    let shouldShow = true;
    for (let i = 0; i < showed.length; i++)
        if (showed[i].key === tweetId)
            shouldShow = false;

    return shouldShow;
}

function showTweet() {
    toShow.sort(function(a, b) {
        a = new Date(a.date);
        b = new Date(b.date);
        return a>b ? -1 : a<b ? 1 : 0;
    });
    if (toShow.length > 0) {
        let nextTweet = toShow.pop();
        if (shouldShowTweet(nextTweet.key)) {
            showed.push(nextTweet);
            io.sockets.emit("tweet", nextTweet.html);
        }
    }
}
io.sockets.on('connection', function (socket) {
    if(showed.length > 0)
        socket.emit("tweet", showed[showed.length-1].html);
});

setInterval(checkTweet, config.timeCheck);
setInterval(showTweet, config.timeSync);
server.listen(config.port);