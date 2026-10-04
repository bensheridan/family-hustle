// Finding the document's bytes inside a PUT body, without re-serialising it.
// A C++ copy of server/envelope.ts — keep the two in step. The body has
// already parsed by the time this runs, so it only tracks strings and depth.
#pragma once
#include <stddef.h>
#include <string.h>
#include <ctype.h>

namespace envelope {

inline size_t skipValue(const char* s, size_t i, size_t n) {
  if (i >= n) return n;
  if (s[i] == '"') {
    for (i++; i < n; i++) {
      if (s[i] == '\\') i++;
      else if (s[i] == '"') return i + 1;
    }
    return n;
  }
  if (s[i] == '{' || s[i] == '[') {
    int depth = 0;
    bool inString = false;
    for (; i < n; i++) {
      char c = s[i];
      if (inString) {
        if (c == '\\') i++;
        else if (c == '"') inString = false;
      } else if (c == '"') inString = true;
      else if (c == '{' || c == '[') depth++;
      else if (c == '}' || c == ']') {
        if (--depth == 0) return i + 1;
      }
    }
    return n;
  }
  // a number, true, false or null
  while (i < n && s[i] != ',' && s[i] != '}' && s[i] != ']' && !isspace((unsigned char)s[i])) i++;
  return i;
}

// Locate the top-level "document" value: [start, end). False if absent.
inline bool findDocument(const char* s, size_t n, size_t& start, size_t& end) {
  size_t i = 0;
  auto ws = [&] { while (i < n && isspace((unsigned char)s[i])) i++; };
  ws();
  if (i >= n || s[i] != '{') return false;
  i++;
  for (;;) {
    ws();
    if (i >= n || s[i] != '"') return false;
    size_t keyStart = i + 1;
    i = skipValue(s, i, n);
    bool isDocument = (i - keyStart - 1 == 8) && strncmp(s + keyStart, "document", 8) == 0;
    ws();
    if (i >= n || s[i] != ':') return false;
    i++;
    ws();
    size_t valueStart = i;
    i = skipValue(s, i, n);
    if (isDocument) {
      start = valueStart;
      end = i;
      return true;
    }
    ws();
    if (i >= n || s[i] != ',') return false;
    i++;
  }
}

}  // namespace envelope
