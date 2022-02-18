# DBoM Federation Agent

DBoM Federation Agent application allows a user to subscribe to a remote DBoM channel.

### Functionalities 

- Allows user to subscribe/join to a remote DBoM channel hosted by another DBoM node
- Query status of the subscription request

## Configuration

| Environment Variable           | Default                      | Description                                                                                                    |
|--------------------------------|------------------------------|----------------------------------------------------------------------------------------------------------------|
 FEDAGENT_PORT                            | 6000                         | Port on which the fed-agent listens |
| MATRIX_HOMESERVER              |                              | Matrix/Synapse Homeserver URL which is accessible to the clients |
| MATRIX_USER_ID                 |                              | User ID for the registered user in @username:homeserver_name format|
| MATRIX_USERNAME                |                              | Username used to login to the homeserver|
| MATRIX_PASSWORD                |                              | Password for the registered user|
| DATABASE_ACCESSCONTROL_URL     |                              | URL on which database-access control application can be reached |
| DB_AGENT_PORT                  |                              | Port on which database agent has to be configured for remote channel|
| NETWORK                        |                              | Container network on which DBoM components are running |


## Deployment 

Instructions for deploying the database-access-control using docker-compose can be found [here](https://github.com/DBOMproject/deployments/docker-compose-autochannel-setup)


## Getting help

If you have any queries on DBoM Federation Agent, feel free to reach us on any of our [communication channels](https://github.com/DBOMproject/community/blob/master/COMMUNICATION.md) 


## Getting involved

This project is currently in the MVP stage and we welcome contributions to drive it to completion. Please refer to [CONTRIBUTING](CONTRIBUTING.md) for more information.


