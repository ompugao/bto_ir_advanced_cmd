#!/bin/bash
docker run -it -v $(pwd):/workspace --privileged --rm ompugao/bto_ir_advanced_cmd $@
