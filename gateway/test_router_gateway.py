import io
import unittest
from unittest.mock import patch

import router_gateway
from router_gateway import (
    decode_length,
    disconnect_ppp_session,
    encode_length,
    encode_sentence,
    parse_attributes,
    RouterOSError,
    verify_api_ssl_configuration,
)


class RouterOsApiEncodingTests(unittest.TestCase):
    def test_length_encoding_round_trips_all_protocol_ranges(self):
        for length in (0, 0x7F, 0x80, 0x3FFF, 0x4000, 0x1FFFFF, 0x200000, 0x0FFFFFFF, 0x10000000):
            with self.subTest(length=length):
                encoded = encode_length(length)
                stream = io.BytesIO(encoded)
                decoded = decode_length(lambda size: stream.read(size))
                self.assertEqual(decoded, length)
                self.assertEqual(stream.read(), b"")

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
