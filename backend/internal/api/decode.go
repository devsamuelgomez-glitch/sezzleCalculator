package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/sam/sezzle-calculator/backend/internal/calc"
)

const maxBodyBytes = 1 << 20 // 1 MiB

// calculateRequest uses pointers for the operands so an absent field can be
// told apart from an explicit 0.
type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

// decodeRequest reads one calculateRequest from r, strictly: JSON content
// type, bounded size, no unknown fields, nothing after the object.
func decodeRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, error) {
	var req calculateRequest

	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return req, newRequestError(http.StatusUnsupportedMediaType, "unsupported_media_type",
			"Content-Type must be application/json")
	}

	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return req, classifyDecodeError(err)
	}
	// A second Decode must hit EOF; anything else is trailing data (or a
	// read error such as the size limit). RawMessage accepts any value, so
	// DisallowUnknownFields cannot fire here.
	var extra json.RawMessage
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		if err != nil && !isSyntaxError(err) {
			return req, classifyDecodeError(err)
		}
		return req, newRequestError(http.StatusBadRequest, "invalid_json",
			"request body must contain a single JSON object")
	}
	return req, nil
}

func isSyntaxError(err error) bool {
	var syntaxErr *json.SyntaxError
	return errors.As(err, &syntaxErr)
}

// classifyDecodeError turns encoding/json failures into contract errors
// without exposing Go type names.
func classifyDecodeError(err error) *requestError {
	var (
		maxErr  *http.MaxBytesError
		typeErr *json.UnmarshalTypeError
	)
	switch {
	case errors.As(err, &maxErr):
		return newRequestError(http.StatusBadRequest, "invalid_json", "request body exceeds 1 MiB")
	case errors.As(err, &typeErr):
		return newRequestError(http.StatusBadRequest, "invalid_json",
			fmt.Sprintf("field %q has the wrong type or is out of range", typeErr.Field))
	case strings.HasPrefix(err.Error(), "json: unknown field"):
		return newRequestError(http.StatusBadRequest, "invalid_json",
			strings.TrimPrefix(err.Error(), "json: "))
	default:
		return newRequestError(http.StatusBadRequest, "invalid_json", "request body is not valid JSON")
	}
}

// operation validates shape and arity and returns the operation with its
// operands in calc order. It does no arithmetic and applies no domain rules.
func (req calculateRequest) operation() (calc.Operation, []float64, error) {
	op := calc.Operation(req.Operation)
	arity := op.Arity()
	if arity == 0 {
		return "", nil, newRequestError(http.StatusBadRequest, "unknown_operation",
			fmt.Sprintf("unknown operation %q", req.Operation))
	}
	if req.A == nil {
		return "", nil, missingOperand("a", op)
	}
	if arity == 1 {
		if req.B != nil {
			return "", nil, newRequestError(http.StatusBadRequest, "unexpected_operand",
				fmt.Sprintf("operand \"b\" is not allowed for %s", op))
		}
		return op, []float64{*req.A}, nil
	}
	if req.B == nil {
		return "", nil, missingOperand("b", op)
	}
	return op, []float64{*req.A, *req.B}, nil
}

func missingOperand(name string, op calc.Operation) *requestError {
	return newRequestError(http.StatusBadRequest, "missing_operand",
		fmt.Sprintf("operand %q is required for %s", name, op))
}
