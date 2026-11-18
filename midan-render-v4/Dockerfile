FROM node:22-bookworm-slim AS node_runtime
FROM python:3.12-slim-bookworm
COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/* && groupadd --gid 10001 worker && useradd --uid 10001 --gid 10001 --no-create-home worker
WORKDIR /opt/worker
RUN pip install --no-cache-dir --only-binary=:all: numpy==2.3.5 scipy==1.17.0 webrtcvad-wheels==2.0.14 && python -c 'import numpy,scipy,webrtcvad' && ffmpeg -version >/dev/null && ffprobe -version >/dev/null
COPY bootstrap.cjs ./
COPY encrypted ./encrypted
RUN node --check bootstrap.cjs
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TMPDIR=/tmp PORT=8080 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
USER 10001:10001
EXPOSE 8080
CMD ["node","bootstrap.cjs"]
