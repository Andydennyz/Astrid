import io
import unittest
from unittest.mock import patch

import router_gateway
from router_gateway import (
    decode_length,
    configure_router_radius,
    disconnect_ppp_session,
    encode_length,
    encode_sentence,
    parse_attributes,
    RouterOSError,
    verify_api_ssl_configuration,
)


class RouterOsApiEncodingTests(unittest.TestCase):
    def test_fatal_api_response_identifies_command_without_logging_arguments(self):
        class FakeConnection:
            def __init__(self):
                self.response = io.BytesIO(
                    encode_sentence(["!fatal", "=message=connection closed"])
                )

            def sendall(self, _data):
                return None

            def recv(self, length):
                return self.response.read(length)

        secret = "sensitive-radius-secret"
        with self.assertRaisesRegex(
            RouterOSError,
            "RouterOS closed the API session while executing command /radius/add",
        ) as error:
            router_gateway.run_command(
                FakeConnection(),
                "/radius/add",
                f"=secret={secret}",
            )

        self.assertNotIn(secret, str(error.exception))

    def test_radius_read_error_includes_sanitized_routeros_diagnostic(self):
        class FakeConnection:
            def __init__(self):
                self.response = io.BytesIO(
                    encode_sentence(["!fatal", "=message=not enough permissions\n"])
                )

            def sendall(self, _data):
                return None

            def recv(self, length):
                return self.response.read(length)

        with self.assertRaisesRegex(
            RouterOSError,
            r"RouterOS closed the API session while executing command /radius/print: not enough permissions",
        ):
            router_gateway.run_command(
                FakeConnection(),
                "/radius/print",
                "=.proplist=.id,comment,service,address,src-address",
            )

    def test_length_encoding_round_trips_all_protocol_ranges(self):
        for length in (0, 0x7F, 0x80, 0x3FFF, 0x4000, 0x1FFFFF, 0x200000, 0x0FFFFFFF, 0x10000000):
            with self.subTest(length=length):
                encoded = encode_length(length)
                stream = io.BytesIO(encoded)
                decoded = decode_length(lambda size: stream.read(size))
                self.assertEqual(decoded, length)
                self.assertEqual(stream.read(), b"")

    def test_radius_configuration_uses_api_ssl_without_creating_local_ppp_secrets(self):
        operation = {
            "managementAddress": "10.77.0.2",
            "gatewaySourceAddress": "10.77.0.1",
            "apiPort": 8729,
            "apiUsername": "astrid-api-123456789abc",
            "radiusServerAddress": "10.77.0.1",
            "routerTunnelAddress": "10.77.0.2",
            "nasIdentifier": "astrid-" + "a" * 32,
            "radiusSecret": "b" * 64,
        }
        credentials = {
            "username": "astrid-api-123456789abc",
            "password": "router-api-password",
        }
        raw_socket = unittest.mock.MagicMock()
        connection = unittest.mock.MagicMock()
        raw_socket.__enter__.return_value = raw_socket
        raw_socket.__exit__.return_value = False
        connection_context = unittest.mock.MagicMock()
        connection_context.__enter__.return_value = connection
        connection_context.__exit__.return_value = False
        tls_context = unittest.mock.MagicMock()
        tls_context.wrap_socket.return_value = connection_context

        with (
            patch("router_gateway.socket.create_connection", return_value=raw_socket),
            patch("router_gateway.ssl.create_default_context", return_value=tls_context),
            patch(
                "router_gateway.run_command",
                side_effect=lambda _connection, *words: (
                    [
                        {
                            ".id": "*1",
                            "comment": "Astrid temporary PPPoE lab test",
                            "service": "ppp",
                            "address": "10.77.0.1",
                            "src-address": "10.77.0.2",
                        }
                    ]
                    if words
                    == (
                        "/radius/print",
                        "=.proplist=.id,comment,service,address,src-address",
                    )
                    else []
                ),
            ) as run_command,
        ):
            detail = configure_router_radius(
                operation,
                credentials,
                "/etc/astrid/router-ca.pem",
                10,
            )

        self.assertEqual(
            detail,
            "Configured RouterOS PPP RADIUS authentication and accounting",
        )
        commands = [call.args[1:] for call in run_command.call_args_list]
        self.assertEqual(commands[0][0], "/login")
        self.assertEqual(
            commands[1],
            (
                "/radius/print",
                "=.proplist=.id,comment,service,address,src-address",
            ),
        )
        self.assertEqual(commands[2][0:2], ("/radius/set", "=.id=*1"))
        self.assertIn("=secret=" + "b" * 64, commands[2])
        self.assertIn("=service=ppp", commands[2])
        self.assertIn("=comment=Astrid workspace-wide RADIUS", commands[2])
        self.assertFalse(any(command[0] == "/radius/add" for command in commands))
        self.assertIn(("/ppp/aaa/set", "=use-radius=yes", "=accounting=yes", "=interim-update=5m"), commands)
        self.assertFalse(any(command[0] == "/ppp/secret/add" for command in commands))

    def test_radius_configuration_rejects_ambiguous_existing_ppp_entries(self):
        operation = {
            "managementAddress": "10.77.0.2",
            "gatewaySourceAddress": "10.77.0.1",
            "apiPort": 8729,
            "apiUsername": "astrid-api-123456789abc",
            "radiusServerAddress": "10.77.0.1",
            "routerTunnelAddress": "10.77.0.2",
            "nasIdentifier": "astrid-" + "a" * 32,
            "radiusSecret": "b" * 64,
        }
        credentials = {
            "username": "astrid-api-123456789abc",
            "password": "router-api-password",
        }
        raw_socket = unittest.mock.MagicMock()
        raw_socket.__enter__.return_value = raw_socket
        raw_socket.__exit__.return_value = False
        connection = unittest.mock.MagicMock()
        connection_context = unittest.mock.MagicMock()
        connection_context.__enter__.return_value = connection
        connection_context.__exit__.return_value = False
        tls_context = unittest.mock.MagicMock()
        tls_context.wrap_socket.return_value = connection_context
        matching_row = {
            ".id": "*1",
            "comment": "Existing PPP entry",
            "service": "ppp",
            "address": "10.77.0.1",
            "src-address": "10.77.0.2",
        }

        with (
            patch("router_gateway.socket.create_connection", return_value=raw_socket),
            patch("router_gateway.ssl.create_default_context", return_value=tls_context),
            patch(
                "router_gateway.run_command",
                side_effect=lambda _connection, *words: (
                    [matching_row, {**matching_row, ".id": "*2"}]
                    if words
                    == (
                        "/radius/print",
                        "=.proplist=.id,comment,service,address,src-address",
                    )
                    else []
                ),
            ) as run_command,
        ):
            with self.assertRaisesRegex(
                RouterOSError,
                "Multiple PPP RADIUS entries match",
            ):
                configure_router_radius(
                    operation,
                    credentials,
                    "/etc/astrid/router-ca.pem",
                    10,
                )

        commands = [call.args[1:] for call in run_command.call_args_list]
        self.assertFalse(any(command[0] in ("/radius/set", "/radius/add") for command in commands))

    def test_sentence_words_are_utf8_length_prefixed_and_terminated(self):
        encoded = encode_sentence(["/system/identity/print", "=name=Router-é"])
        stream = io.BytesIO(encoded)
        words = []
        while True:
            length = decode_length(lambda size: stream.read(size))
            if length == 0:
                break
            words.append(stream.read(length).decode("utf-8"))
        self.assertEqual(words, ["/system/identity/print", "=name=Router-é"])

    def test_routeros_reply_attributes_are_parsed(self):
        self.assertEqual(
            parse_attributes(["!re", "=name=CHR-Lab", "=version=7.18.2"]),
            {"name": "CHR-Lab", "version": "7.18.2"},
        )

    def test_api_ssl_verification_requires_exact_service_and_user_restrictions(self):
        operation = {
            "gatewaySourceAddress": "10.77.0.1",
            "certificateName": "astrid-api-ssl",
            "apiUsername": "astrid-api-a1b2c3d4e5f6",
        }

        verify_api_ssl_configuration(
            operation,
            [
                {
                    "name": "api-ssl",
                    "port": "8729",
                    "address": "10.77.0.1/32",
                    "certificate": "astrid-api-ssl",
                    "tls-version": "only-1.2",
                }
            ],
            [{"name": "api", "disabled": "true"}],
            [
                {
                    "name": "astrid-api-a1b2c3d4e5f6",
                    "group": "astrid-management",
                    "address": "10.77.0.1/32",
                }
            ],
        )

    def test_api_ssl_verification_accepts_dedicated_radius_worker_group(self):
        operation = {
            "gatewaySourceAddress": "10.77.0.1",
            "certificateName": "astrid-api-ssl",
            "apiUsername": "astrid-api-a1b2c3d4e5f6",
        }

        verify_api_ssl_configuration(
            operation,
            [
                {
                    "name": "api-ssl",
                    "port": "8729",
                    "address": "10.77.0.1/32",
                    "certificate": "astrid-api-ssl",
                    "tls-version": "only-1.2",
                }
            ],
            [{"name": "api", "disabled": "true"}],
            [
                {
                    "name": "astrid-api-a1b2c3d4e5f6",
                    "group": "astrid-radius-worker",
                    "address": "10.77.0.1/32",
                }
            ],
        )

    def test_api_ssl_verification_rejects_an_unrestricted_service(self):
        operation = {
            "gatewaySourceAddress": "10.77.0.1",
            "certificateName": "astrid-api-ssl",
            "apiUsername": "astrid-api-a1b2c3d4e5f6",
        }

        with self.assertRaisesRegex(RouterOSError, "source restriction"):
            verify_api_ssl_configuration(
                operation,
                [
                    {
                        "name": "api-ssl",
                        "port": "8729",
                        "address": "",
                        "certificate": "astrid-api-ssl",
                        "tls-version": "only-1.2",
                    }
                ],
                [{"name": "api", "disabled": "true"}],
                [
                    {
                        "name": "astrid-api-a1b2c3d4e5f6",
                        "group": "astrid-management",
                        "address": "10.77.0.1/32",
                    }
                ],
            )

    def test_api_ssl_verification_ignores_sparse_active_connection_row(self):
        operation = {
            "gatewaySourceAddress": "10.77.0.1",
            "certificateName": "astrid-api-ssl",
            "apiUsername": "astrid-api-a1b2c3d4e5f6",
        }

        verify_api_ssl_configuration(
            operation,
            [
                {
                    ".id": "*9",
                    "name": "api-ssl",
                    "port": "8729",
                    "address": "10.77.0.1/32",
                    "certificate": "astrid-api-ssl",
                    "disabled": "false",
                    "tls-version": "only-1.2",
                },
                {
                    ".id": "*11",
                    "name": "api-ssl",
                    "port": "8729",
                    "disabled": "false",
                },
            ],
            [{"name": "api", "disabled": "true"}],
            [
                {
                    "name": "astrid-api-a1b2c3d4e5f6",
                    "group": "astrid-management",
                    "address": "10.77.0.1/32",
                }
            ],
        )

    def test_api_ssl_verification_rejects_enabled_plain_api(self):
        operation = {
            "gatewaySourceAddress": "10.77.0.1",
            "certificateName": "astrid-api-ssl",
            "apiUsername": "astrid-api-a1b2c3d4e5f6",
        }
        with self.assertRaisesRegex(RouterOSError, "Unencrypted RouterOS API"):
            verify_api_ssl_configuration(
                operation,
                [
                    {
                        "name": "api-ssl",
                        "port": "8729",
                        "address": "10.77.0.1/32",
                        "certificate": "astrid-api-ssl",
                        "tls-version": "only-1.2",
                    }
                ],
                [{"name": "api", "disabled": "false"}],
                [
                    {
                        "name": "astrid-api-a1b2c3d4e5f6",
                        "group": "astrid-management",
                        "address": "10.77.0.1/32",
                    }
                ],
            )

    def test_api_ssl_verification_rejects_weaker_tls_configuration(self):
        operation = {
            "gatewaySourceAddress": "10.77.0.1",
            "certificateName": "astrid-api-ssl",
            "apiUsername": "astrid-api-a1b2c3d4e5f6",
        }
        with self.assertRaisesRegex(RouterOSError, "TLS 1.2"):
            verify_api_ssl_configuration(
                operation,
                [
                    {
                        "name": "api-ssl",
                        "port": "8729",
                        "address": "10.77.0.1/32",
                        "certificate": "astrid-api-ssl",
                        "tls-version": "any",
                    }
                ],
                [{"name": "api", "disabled": "true"}],
                [
                    {
                        "name": "astrid-api-a1b2c3d4e5f6",
                        "group": "astrid-management",
                        "address": "10.77.0.1/32",
                    }
                ],
            )

    def test_disconnect_removes_only_the_exact_router_accounting_session(self):
        command_calls = []

        def fake_run_command(_connection, *words):
            command_calls.append(words)
            if words[0] == "/ppp/active/print":
                return [
                    {".id": "*1", "name": "subscriber", "session-id": "old-session"},
                    {".id": "*2", "name": "subscriber", "session-id": "target-session"},
                ]
            return []

        with patch.object(router_gateway, "run_command", side_effect=fake_run_command):
            result = disconnect_ppp_session(
                object(), "subscriber", "target-session"
            )

        self.assertEqual(result, "Disconnected the matching PPPoE session")
        self.assertEqual(
            command_calls,
            [
                ("/ppp/active/print", "?name=subscriber"),
                ("/ppp/active/remove", "=.id=*2"),
            ],
        )

    def test_disconnect_does_not_remove_a_reconnected_session_with_another_id(self):
        command_calls = []

        def fake_run_command(_connection, *words):
            command_calls.append(words)
            return [{".id": "*3", "name": "subscriber", "session-id": "new-session"}]

        with patch.object(router_gateway, "run_command", side_effect=fake_run_command):
            result = disconnect_ppp_session(
                object(), "subscriber", "expired-session"
            )

        self.assertIn("already be disconnected", result)
        self.assertEqual(len(command_calls), 1)


if __name__ == "__main__":
    unittest.main()
