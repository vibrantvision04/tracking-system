package masterreport

// filter_hash.go — task 4.2 (design §3.3, Req 2.6, 12.1).
//
// FilterHash computes the deterministic, order-independent SHA-256 hex digest
// that keys every report_output_cache row. Two filter payloads that name the
// same key-value set in any order MUST produce byte-equal digests; that is
// Property 1 (Filter_Hash Order Independence).
//
// The function refuses to hash any payload that has not first passed
// FilterValidator.Validate against the supplied ReportDefinition. Running
// Validate here is intentional: the cache key is the boundary between
// "received from the wire" and "trusted to drive a DataSource invocation",
// so we never want a hash to exist for a payload the schema layer would
// reject.
//
// Canonicalisation rules (closed set; anything else is an error):
//
//   string         raw UTF-8 bytes, no trim, no case change
//   int            strconv.FormatFloat(float64(x), 'g', -1, 64)
//   float64        strconv.FormatFloat(x,           'g', -1, 64)
//   []int          sort ascending, deduplicate, comma-join
//   time.Time      .UTC().Format(time.RFC3339Nano)
//   [2]time.Time   [0].UTC().Format(RFC3339Nano) + "," + [1].UTC().Format(RFC3339Nano)
//
// The wire-level emission is `key1=value1;key2=value2;...` with `;` as the
// separator and no trailing `;`. Keys are sorted lexicographically by their
// string form before emission so the byte stream — and therefore the digest
// — is independent of Go's map-iteration order.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// FilterHash returns the 64-character lowercase hex SHA-256 of the canonical
// serialisation of p for the schema declared by def. The hash is suitable
// for use as the `filter_hash` column of report_output_cache.
//
// Errors:
//   - *ValidationError when Validate rejects p (missing required keys or
//     unsupported keys present).
//   - A wrapped type error when a value in p has a Go type outside the
//     closed canonicalisation set above. This case should be unreachable
//     in practice because the HTTP decoder constrains FilterPayload values
//     to the permitted shapes; the guard exists so a future code-path that
//     constructs a payload programmatically cannot silently bypass it.
//
// Validates: Requirements 2.6, 12.1.
func FilterHash(def *ReportDefinition, p FilterPayload) (string, error) {
	if err := (Validator{}).Validate(def, p); err != nil {
		return "", err
	}

	// Sort by the string form of FilterKey for a deterministic byte stream.
	// We keep the original FilterKey on the side so the map lookup below
	// uses the exact typed key the payload was stored under.
	keys := make([]string, 0, len(p))
	keyByString := make(map[string]FilterKey, len(p))
	for k := range p {
		ks := string(k)
		keys = append(keys, ks)
		keyByString[ks] = k
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, ks := range keys {
		canon, err := canonicalizeFilterValue(p[keyByString[ks]])
		if err != nil {
			return "", fmt.Errorf("master report: filter %q: %w", ks, err)
		}
		if i > 0 {
			b.WriteByte(';')
		}
		b.WriteString(ks)
		b.WriteByte('=')
		b.WriteString(canon)
	}

	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:]), nil
}

// canonicalizeFilterValue maps one Go value drawn from the permitted
// FilterPayload value set to its canonical string form. The closed set of
// accepted types mirrors design §3.3:
//
//   string | int | float64 | []int | time.Time | [2]time.Time
//
// Anything else is rejected with an "unsupported filter value type" error
// rather than coerced via fmt.Sprintf — silent coercion would let a future
// caller introduce a non-deterministic representation (e.g. map iteration
// order inside a Stringer) and break Property 1.
func canonicalizeFilterValue(v any) (string, error) {
	switch x := v.(type) {
	case string:
		// Raw UTF-8: no Trim, no ToLower. Two filters that differ in case
		// or surrounding whitespace are intentionally distinct cache keys.
		return x, nil

	case int:
		// %g via FormatFloat — the spec asks for locale-free `%g`
		// formatting for both int and float64 so they share one rule.
		// int values up to 2^53 round-trip exactly through float64.
		return strconv.FormatFloat(float64(x), 'g', -1, 64), nil

	case float64:
		return strconv.FormatFloat(x, 'g', -1, 64), nil

	case []int:
		if len(x) == 0 {
			return "", nil
		}
		sorted := make([]int, len(x))
		copy(sorted, x)
		sort.Ints(sorted)

		dedup := make([]int, 0, len(sorted))
		for i, n := range sorted {
			if i == 0 || n != sorted[i-1] {
				dedup = append(dedup, n)
			}
		}
		parts := make([]string, len(dedup))
		for i, n := range dedup {
			parts[i] = strconv.Itoa(n)
		}
		return strings.Join(parts, ","), nil

	case time.Time:
		// UTC + RFC3339Nano: stable across the wire even when the caller
		// sent a non-UTC local time. Nano precision is well above any
		// filter-level granularity we use today and costs nothing.
		return x.UTC().Format(time.RFC3339Nano), nil

	case [2]time.Time:
		// Date-range canonicalisation: both endpoints in UTC, joined with
		// a single comma. The validator already enforces that at least
		// one endpoint is non-zero for required date_range filters;
		// FilterHash itself stays purely mechanical.
		return x[0].UTC().Format(time.RFC3339Nano) + "," +
			x[1].UTC().Format(time.RFC3339Nano), nil

	default:
		return "", fmt.Errorf("unsupported filter value type %T", v)
	}
}
