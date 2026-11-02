FROM postgres:18.6-trixie@sha256:3a4264520e121176619f54ff867d12774bc81e95e7b84db58d63bccdb6144b81

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && echo "deb [signed-by=/usr/local/share/keyrings/postgres.gpg.asc] https://apt-archive.postgresql.org/pub/repos/apt trixie-pgdg-archive main" \
        > /etc/apt/sources.list.d/pgdg-archive.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends pgbackrest=2.60.0-1.pgdg13+1 \
    && rm -rf /var/lib/apt/lists/* \
    && rm /etc/pgbackrest.conf \
    && install -d -o root -g postgres -m 0750 /etc/pgbackrest \
    && install -d -o postgres -g postgres -m 0750 /var/spool/pgbackrest \
    && install -d -o postgres -g postgres -m 0700 /var/lib/postgresql/18 /var/lib/postgresql/18/docker

COPY --chown=root:postgres --chmod=0640 infra/pgbackrest/pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
COPY --chown=root:postgres --chmod=0640 infra/pgbackrest/postgresql.conf /etc/postgresql/postgresql.conf

ENV PGDATA=/var/lib/postgresql/18/docker

USER postgres

CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
