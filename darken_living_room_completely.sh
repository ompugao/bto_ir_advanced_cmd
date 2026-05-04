#!/bin/bash
cd "$(dirname "$0")"

for i in {1..20}; do
	bto_advanced_USBIR_cmd -d `cat darker.txt`
	sleep 0.1
done

for i in {1..20}; do
	bto_advanced_USBIR_cmd -d `cat orange.txt`
	sleep 0.1
done
