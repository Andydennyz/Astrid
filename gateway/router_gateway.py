#!/usr/bin/env python3
import argparse
import ipaddress
import json
import logging
import os
import socket
import ssl
import stat
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

MAX_WORD_LENGTH = 0xFFFFFFFF
MAX_SENTENCE_LENGTH = 1024 * 1024


class GatewayError(Exception):
    pass


class RouterOSError(Exception):
    pass


def encode_length(length: int) -> bytes:
    if length < 0 or length > MAX_WORD_LENGTH:
        raise ValueError("RouterOS API word is too large")
    if length <= 0x7F:
        return bytes([length])
    if length <= 0x3FFF:
        return (length | 0x8000).to_bytes(2, "big")
    if length <= 0x1FFFFF:
        return (length | 0xC00000).to_bytes(3, "big")
    if length <= 0x0FFFFFFF:
        return (length | 0xE0000000).to_bytes(4, "big")
    return b"\xF0" + length.to_bytes(4, "big")


def decode_length(read_exact: Callable[[int], bytes]) -> int:
    first = read_exact(1)[0]
    if first < 0x80:
        return first
    if first < 0xC0:
        return ((first & 0x3F) << 8) | read_exact(1)[0]
    if first < 0xE0:
        return ((first & 0x1F) << 16) | int.from_bytes(read_exact(2), "big")
    if first < 0xF0:
        return ((first & 0x0F) << 24) | int.from_bytes(read_exact(3), "big")
    if first == 0xF0:
        return int.from_bytes(read_exact(4), "big")
    raise RouterOSError("RouterOS API sent an unsupported length control byte")


def encode_sentence(words: list[str]) -> bytes:
    encoded = bytearray()
    for word in words:
        value = word.encode("utf-8")
        encoded.extend(encode_length(len(value)))
        encoded.extend(value)
    encoded.append(0)
    if len(encoded) > MAX_SENTENCE_LENGTH:
        raise ValueError("RouterOS API sentence is too large")
    return bytes(encoded)


def read_exact(connection: ssl.SSLSocket, length: int) -> bytes:
    result = bytearray()
    while len(result) < length:
        block = connection.recv(length - len(result))
        if not block:
            raise RouterOSError("RouterOS closed the API-SSL connection")
        result.extend(block)
    return bytes(result)


def read_sentence(connection: ssl.SSLSocket) -> list[str]:
    words: list[str] = []
    total_length = 0
    while True:
        word_length = decode_length(lambda length: read_exact(connection, length))
        if word_length == 0:
            return words
        total_length += word_length
        if total_length > MAX_SENTENCE_LENGTH:
            raise RouterOSError("RouterOS API response sentence is too large")
        try:
            words.append(read_exact(connection, word_length).decode("utf-8"))
        except UnicodeDecodeError as error:
            raise RouterOSError("RouterOS API response was not valid UTF-8") from error


def parse_attributes(words: list[str]) -> dict[str, str]:
    attributes: dict[str, str] = {}
    for word in words:
        if word.startswith("="):
            parts = word.split("=", 2)
            if len(parts) == 3:
                attributes[parts[1]] = parts[2]
    return attributes


def run_command(connection: ssl.SSLSocket, *words: str) -> list[dict[str, str]]:
    connection.sendall(encode_sentence(list(words)))
    rows: list[dict[str, str]] = []
    while True:
        sentence = read_sentence(connection)
        if not sentence:
            continue
        response_type = sentence[0]
        if response_type == "!re":
            rows.append(parse_attributes(sentence[1:]))
        elif response_type == "!trap":
            raise RouterOSError("RouterOS rejected the API command")
        elif response_type == "!fatal":
            raise RouterOSError("RouterOS closed the API session")
        elif response_type in ("!done", "!empty"):
            return rows
        else:
            raise RouterOSError("RouterOS returned an unsupported API response")


def probe_router(
    operation: dict[str, Any],
    credentials: dict[str, Any],
    ca_bundle: str | None,
    timeout: float,
) -> str:
    address = str(ipaddress.IPv4Address(operation["managementAddress"]))
    source = str(ipaddress.IPv4Address(operation["gatewaySourceAddress"]))
    port = int(operation["apiPort"])
    if port != 8729:
        raise RouterOSError("Only RouterOS API-SSL on TCP 8729 is supported")
    if credentials.get("username") != operation.get("apiUsername"):
        raise RouterOSError("Local API username does not match the queued router setup")
    username = credentials.get("username")
    password = credentials.get("password")
    if not isinstance(username, str) or not username or not isinstance(password, str) or not password:
        raise RouterOSError("Router API credentials are missing from the local gateway config")

    context = ssl.create_default_context(cafile=ca_bundle)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    raw_socket = socket.create_connection(
        (address, port),
        timeout=timeout,
        source_address=(source, 0),
    )
    with raw_socket:
        with context.wrap_socket(raw_socket, server_hostname=address) as connection:
            run_command(connection, "/login", f"=name={username}", f"=password={password}")
            identity_rows = run_command(connection, "/system/identity/print")
            resource_rows = run_command(connection, "/system/resource/print")

    identity = identity_rows[0].get("name", "unknown") if identity_rows else "unknown"
    version = resource_rows[0].get("version", "unknown") if resource_rows else "unknown"
    return f"Verified API-SSL; identity={identity}; RouterOS version={version}"


def load_config(path: Path) -> dict[str, Any]:
    if os.name == "posix" and stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise PermissionError(f"{path} must be readable only by its owner (mode 0600)")
    config = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError("Gateway configuration must be a JSON object")
    parsed_url = urllib.parse.urlparse(config.get("convex_site_url", ""))
    if (
        parsed_url.scheme != "https"
        or not parsed_url.netloc
        or parsed_url.username
        or parsed_url.password
        or parsed_url.query
        or parsed_url.fragment
    ):
        raise ValueError("convex_site_url must be an HTTPS Convex site URL")
    if not isinstance(config.get("workspace_id"), str) or not config["workspace_id"]:
        raise ValueError("workspace_id is required")
    gateway_token = config.get("gateway_token")
    if (
        not isinstance(gateway_token, str)
        or len(gateway_token) != 64
        or any(character not in "0123456789abcdef" for character in gateway_token)
    ):
        raise ValueError("gateway_token must be the 64-character token shown by the app")
    if not isinstance(config.get("routers"), dict):
        raise ValueError("routers must map router IDs to local API credentials")
    config["convex_site_url"] = f"{parsed_url.scheme}://{parsed_url.netloc}"
    config["poll_interval_seconds"] = int(config.get("poll_interval_seconds", 15))
    config["request_timeout_seconds"] = int(config.get("request_timeout_seconds", 20))
    if not 1 <= config["poll_interval_seconds"] <= 300:
        raise ValueError("poll_interval_seconds must be between 1 and 300")
    if not 1 <= config["request_timeout_seconds"] <= 60:
        raise ValueError("request_timeout_seconds must be between 1 and 60")
    return config


class GatewayClient:
    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.timeout = config["request_timeout_seconds"]

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            f'{self.config["convex_site_url"]}{path}',
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f'Bearer {self.config["gateway_token"]}',
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read(MAX_SENTENCE_LENGTH).decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise GatewayError(f"Convex gateway endpoint returned HTTP {error.code}") from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
            raise GatewayError("Could not communicate with the Convex gateway endpoint") from error
        if not isinstance(payload, dict):
            raise GatewayError("Convex gateway endpoint returned an invalid response")
        return payload

    def claim(self) -> tuple[dict[str, Any], str] | None:
        response = self.post(
            "/api/router-gateway/operations/claim",
            {"workspaceId": self.config["workspace_id"]},
        )
        operation = response.get("operation")
        claim_token = response.get("claimToken")
        if operation is None:
            return None
        if not isinstance(operation, dict) or not isinstance(claim_token, str):
            raise GatewayError("Convex returned an incomplete operation claim")
        if operation.get("operationType") != "verify_management":
            raise GatewayError("Convex returned an unsupported router operation")
        return operation, claim_token

    def complete(
        self,
        operation_id: str,
        claim_token: str,
        status: str,
        detail: str,
    ) -> bool:
        response = self.post(
            "/api/router-gateway/operations/complete",
            {
                "workspaceId": self.config["workspace_id"],
                "operationId": operation_id,
                "claimToken": claim_token,
                "status": status,
                "detail": detail[:500],
            },
        )
        return response.get("completed") is True


def process_operation(client: GatewayClient, config: dict[str, Any], claim: tuple[dict[str, Any], str]) -> None:
    operation, claim_token = claim
    operation_id = operation.get("operationId")
    router_id = operation.get("routerId")
    try:
        if not isinstance(operation_id, str) or not isinstance(router_id, str):
            raise RouterOSError("Gateway operation response is missing router identifiers")
        credentials = config["routers"].get(router_id)
        if not isinstance(credentials, dict):
            raise RouterOSError("No local API credentials are configured for this router")
        detail = probe_router(
            operation,
            credentials,
            credentials.get("ca_bundle", config.get("ca_bundle")),
            config["request_timeout_seconds"],
        )
        status = "succeeded"
        logging.info("Router API-SSL verification succeeded for router %s: %s", router_id, detail)
    except (KeyError, TypeError, ValueError, OSError, ssl.SSLError, RouterOSError) as error:
        status = "failed"
        detail = f"API-SSL verification failed: {error}"
        logging.error("Router API-SSL verification failed for router %s: %s", router_id, error)
    if not client.complete(operation_id, claim_token, status, detail):
        logging.warning("Gateway operation %s was no longer leased when its result was submitted", operation_id)


def run(config: dict[str, Any]) -> None:
    client = GatewayClient(config)
    poll_interval = config["poll_interval_seconds"]
    while True:
        try:
            claim = client.claim()
            if claim is None:
                time.sleep(poll_interval)
                continue
            process_operation(client, config, claim)
        except GatewayError as error:
            logging.error("%s", error)
            time.sleep(poll_interval)


def main() -> None:
    parser = argparse.ArgumentParser(description="Astrid RouterOS API-SSL gateway worker")
    parser.add_argument("--config", required=True, type=Path)
    arguments = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    config = load_config(arguments.config)
    run(config)


if __name__ == "__main__":
    main()
