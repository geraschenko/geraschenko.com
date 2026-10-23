---
title: line-follower
url: https://github.com/geraschenko/line-follower
date: 2026-10-14
---

A dependency-free TypeScript library for following a stream or append-only file line by line, like `tail -F`: each complete line arrives as soon as it is written, with its byte offset (in the case of a file). It handles the parts that are easy to get wrong: appends racing the watch setup, coalesced `fs.watch` events, lines torn across reads, and atomic replacement by rename. I use this to follow session files in clauctl.
