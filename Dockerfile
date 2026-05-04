FROM ubuntu:24.04
RUN apt-get update && apt-get install -y -f build-essential && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y -f libusb-1.0-0-dev && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace
COPY bto_advanced_USBIR_cmd.c /workspace
COPY Makefile /workspace
WORKDIR /workspace
RUN make -j $(nproc) && make install && make clean
COPY darker.txt orange.txt whiter.txt brighter.txt darken_living_room.sh darken_living_room_completely.sh /workspace/
#ENTRYPOINT ["bto_advanced_USBIR_cmd"]
