
# Implement

If there is no explicitly active Team Harness pipeline, implement the request
directly with the current runtime's normal tools and permission model. Do not
create pipeline state or gates.

If durable state proves that a pipeline is explicitly active, require its
recorded design approval before changing files. Follow the approved task and
file scope, preserve unrelated changes, record implementation evidence, and
leave acceptance validation to the pipeline's validation phase. The primary
thread owns state and operator decisions; specialists cannot approve gates.
