import io
import unittest

from router_gateway import decode_length, encode_length, encode_sentence, parse_attributes


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


if __name__ == "__main__":
    unittest.main()
