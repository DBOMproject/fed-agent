/* eslint-disable no-prototype-builtins */
/* eslint-disable no-continue */
/* eslint-disable no-plusplus */
/* eslint-disable no-await-in-loop */
/* eslint-disable radix */

/*
 * Copyright 2022 Unisys Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Exposes restful APIs to allow users to subscribe to a channel
 * @module FedAgent
 */

/* eslint-disable no-console */
const sdk = require('matrix-js-sdk');
const axios = require('axios');
require('dotenv').config();
const process = require('process');
const fs = require('fs');
const uuid4 = require('uuid4');
const yaml = require('js-yaml');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const port = process.env.FEDAGENT_PORT || 6000;

const client = sdk.createClient(process.env.MATRIX_HOMESERVER);
const myUserId = process.env.MATRIX_USER_ID;
const loginUserName = process.env.MATRIX_USERNAME;
const password = process.env.MATRIX_PASSWORD;
const databaseAccessControlUrl = process.env.DATABASE_ACCESSCONTROL_URL;
const inputfile = '/tmp/agent-config.yaml';
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(express.urlencoded({
  extended: true,
}));

// For preflight checks to pass
app.use(cors());

const userState = {};
/** 
 * sleep function
 */ 
 function sleep(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); }

/**
 * Configure Database agent based on the passed parameters and update the agent-config.yaml file
 * @param {String} uri uri received from remote DBoM node
 * @param {String} userName username configured in remote database
 * @param {String} pwd password for username
 * @param {String} repoID repoID for the channel
 * @param {uuid} joinId unique id for the request
 */ 
async function configureAgent(uri, userName, pwd, repoID, joinId) {
  try {
    // Create docker container to run the database agent
    const dbAgentPort = process.env.DB_AGENT_PORT || 3500;
    const network = process.env.NETWORK || 'dbom';
    // eslint-disable-next-line max-len
    const res = await axios.post(`${databaseAccessControlUrl}/startAgent`, {
      uri, userName, pwd, repoID, dbAgentPort, network,
    });
    const { host, agentPort } = res.data;
    if (host && agentPort) {
    // Update the agent-confg.yaml file to re-load gateway with new database agent
      const yamlContent = yaml.load(fs.readFileSync(inputfile, { encoding: 'utf-8' }));
      yamlContent.agents.push({
        [repoID]: {
          version: 1, host, port: parseInt(agentPort), enabled: true,
        },
      });
      fs.writeFileSync(inputfile, yaml.dump(yamlContent));
      userState[joinId].status = 'Channel successfully subscribed';
    }
  } catch (e) {
    console.log(e);
  }
}
async function joinRoomOnInvite(member, count) {
  for (let i = count; i > 0; i--) {
    try {
      if (member.membership === 'invite' && member.userId === myUserId) {
        const { roomId } = member;
        const room = await client.joinRoom(roomId);
        console.log('Auto-joined %s', roomId);
        sleep(300);
        try {
          const { syncToken } = room.client.store;
          const { chunk } = await client.createMessagesRequest(roomId, syncToken, 30, 'b');
          const retrievedEvents = chunk.filter((message) => message.type === 'm.room.message');
          // eslint-disable-next-line max-len
          if (retrievedEvents.length) {
            const readdata = fs.readFileSync('processedEvents.json', (err) => {
              if (err) throw err;
            });
            // eslint-disable-next-line max-len
            if (readdata.length > 0 && JSON.parse(readdata)[`${roomId}-lastProcessedEventTS`] >= retrievedEvents[retrievedEvents.length - 1].origin_server_ts) {
              console.log('Already processed');
            } else {
              let parsedValue;
              if (readdata.length === 0) {
                parsedValue = {
                  [`${roomId}-lastProcessedEventTS`]: retrievedEvents[retrievedEvents.length - 1].origin_server_ts,
                };
              } else {
                parsedValue = JSON.parse(readdata);
                parsedValue[`${roomId}-lastProcessedEventTS`] = retrievedEvents[retrievedEvents.length - 1].origin_server_ts;
              }
              fs.writeFileSync('processedEvents.json', JSON.stringify(parsedValue, null, 2), (err) => {
                if (err) throw err;
              });
              if (JSON.parse(retrievedEvents[retrievedEvents.length - 1].content.body).uri) {
                const {
                  uri, userName, pwd, repoID, joinId,
                } = JSON.parse(retrievedEvents[retrievedEvents.length - 1].content.body);
                if (Object.keys(userState).length === 0) {
                  userState[joinId] = {
                    repoID, status: '',
                  };
                }
                userState[joinId].status = 'Received credentials';
                console.log(uri, userName, pwd, repoID, joinId);
                await configureAgent(uri, userName, pwd, repoID, joinId);
                break;
              }
            }
          }
        } catch (e) {
          console.log(e);
        }
      }
    } catch (e) {
      console.log(e);
      console.log(count);
      continue;
    }
  }
}

/**
 * Output the current status for channel subscription
 * @param {string} id Request Id recieved after sending a request
 */
app.get('/getRequestState/:id', (req, res) => {
  const requestId = req.params.id;
  res.json({ status: userState[requestId].status });
});

/**
 * Login to matrix server with registered user
 */
app.post('/login', (req, res) => {
  client.loginWithPassword(loginUserName, password).then(async (roomData) => {
    console.log('Logged in:', roomData.access_token);
    client.startClient();
    res.send({ msg: 'Logged in successfully' });
  }).catch((err) => {
    console.log(err);
    res.send({ msg: 'Login failed' });
  });
});

/**
 * Send a request to subscribe a channel
 * @param {string} roomId Id of the remote public room
 * @param {string} action 'JOIN/SUBSCRIBE' to subscribe to a channel
 * @param {string} repoID Repository Id of the channel
 * @param {string} channelId Channel Id to subscribe
 * @param {string} role permission required for the channel. Possible Values read/write
 * @returns {string} reqId requestId Id for the request
*/
app.post('/subscribeChannel', (req, res) => {
  const {
    roomId, action, repoID, channelId, role,
  } = req.body;
  const id = uuid4();
  // Initialize the state for the request
  userState[id] = {
    repoID, channelId, role, status: 'Pending',
  };
  // Join the public room to send the request
  client.joinRoom(roomId).then((room) => {
    const message = {
      msgtype: 'm.txt',
      body: JSON.stringify({
        action, repoID, channelId, role, joinId: id,
      }),
    };
    // Send the request to subscribe for the channel via text message
    client.sendMessage(room.roomId, message).then(() => {
      console.log('Message sent');
      userState[id].status = 'Request Sent';
      res.status(200).send({ status: 'Request Sent', reqId: id });
    }).catch((err) => {
      console.log(err);
    });
  }).catch((err) => {
    console.log(err);
    res.status(405).send({ message: err.message });
  });
});

client.on('Room.timeline', async (event, room) => {
  // Listen for the messages in the room
  if (event.getType() === 'm.room.message' && event.getSender() !== client.credentials.userId) {
    console.log('Recieved message:', event.getContent().body);
    const rmId = event.getRoomId();
    const readdata = fs.readFileSync('processedEvents.json', (err) => {
      if (err) throw err;
    });
    if (readdata.length > 0 && JSON.parse(readdata)[`${rmId}-lastProcessedEventTS`] >= event.getTs()) {
      console.log('Already processed');
    } else {
      let parsedValue;
      if (readdata.length === 0) {
        parsedValue = {
          [`${rmId}-lastProcessedEventTS`]: event.getTs(),
        };
      } else {
        parsedValue = JSON.parse(readdata);
        parsedValue[`${rmId}-lastProcessedEventTS`] = event.getTs();
      }
      fs.writeFileSync('processedEvents.json', JSON.stringify(parsedValue, null, 2), (err) => {
        if (err) throw err;
      });
      const message = JSON.parse(event.getContent().body);
      if (message.action) {
        const {
          action, repoID, channelId, role, joinId,
        } = message;
        const creator = room.currentState.getStateEvents('m.room.create', '').getSender();
        const creatorName = room.getMember(creator).rawDisplayName;
        if ((action === 'JOIN' || action === 'SUBSCRIBE') && creatorName === loginUserName) {
          const yamlContent = yaml.load(fs.readFileSync(inputfile, { encoding: 'utf-8' }));
          const foundRepo = yamlContent.agents.filter((agent) => agent.hasOwnProperty(repoID));
          if (foundRepo.length > 0) {
            const userFQDN = event.getSender();
            const userName = event.getSender().split(':')[0].slice(1);
            // call database access control agent to get the credentials
            axios.post(`${databaseAccessControlUrl}/addUser`, { userName, role, channelId }).then((data) => {
              const credentials = data.data;
              credentials.joinId = joinId;
              credentials.repoID = repoID;

              // Create a private direct chat to send the database credentials
              client.createRoom({
                preset: 'trusted_private_chat',
                invite: [userFQDN],
                is_direct: true,
                name: `${userName}-${channelId}-${new Date().getTime()}`,
                room_alias_name: `${userName}-${channelId}-${new Date().getTime()}`,
              }).then(async (roomId) => {
                const content = {
                  body: JSON.stringify(credentials),
                  msgtype: 'm.text',
                };
                // Send the credentials to the user
                client.sendMessage(roomId.room_id, content)
                  .then(() => { console.log('message sent'); })
                  .catch((err) => {
                    console.log(err);
                  });
              }).catch((err) => {
                console.log(err);
              });
            }).catch((err) => {
              console.log(err);
            });
          }
        } else {
          console.log(`${repoID} not found`);
        }
      } else if (message.uri) {
        const {
          joinId, uri, userName, pwd, repoID,
        } = message;
        if (Object.keys(userState).length === 0) {
          userState[joinId] = {
            repoID, status: '',
          };
        }
        userState[joinId].status = 'Received credentials';
        console.log('Received credentials');
        await configureAgent(uri, userName, pwd, repoID, joinId);
      }
    }
  }
});
client.on('RoomMember.membership', async (event, member) => {
  const count = 3;
  await joinRoomOnInvite(member, count);
});
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
