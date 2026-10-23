# Fleet Dispatch conversation

## Operator — initial request

Draw our live vehicle-position flow. Vehicle Feed is an external system. It sends
position updates to Location Gateway. That gateway publishes updates to Position
Stream, which is our broker. Position Stream delivers the updates to Map Service.
Map Service also reads Positions Cache, a database. Put Location Gateway, Position
Stream, Map Service and Positions Cache together inside Dispatch. Keep Vehicle
Feed outside it.

Use the labels "Send positions", "Publish positions", "Deliver positions" and
"Read latest position" for those four connections, respectively. For the last
connection, show the read request from Map Service to Positions Cache, not the
response traveling back. Route Planner exists elsewhere but is outside this
view. I am supplying this description rather than a diagram schema.
