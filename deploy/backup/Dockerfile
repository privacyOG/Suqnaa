FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       age \
       ca-certificates \
       postgresql-client \
       rclone \
       tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/suqnaa-backup
COPY deploy/backup/backup.sh ./backup.sh
COPY deploy/backup/restore.sh ./restore.sh
COPY deploy/backup/scheduler.sh ./scheduler.sh
RUN chmod 0555 backup.sh restore.sh scheduler.sh

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/suqnaa-backup/scheduler.sh"]
