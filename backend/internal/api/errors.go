package api

import (
	"errors"
	"net/http"

	"github.com/sam/sezzle-calculator/backend/internal/calc"
)

// errorBody is the error envelope documented in docs/DESIGN.md.
type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// requestError is a failure the api layer detects itself (decoding, shape and
// arity validation, routing). It carries its own contract status and code.
type requestError struct {
	status  int
	code    string
	message string
}

func (e *requestError) Error() string { return e.message }

func newRequestError(status int, code, message string) *requestError {
	return &requestError{status: status, code: code, message: message}
}

// mapError is the single place where errors become HTTP status codes and
// contract error bodies. Anything it does not recognise, including
// calc.ErrInvalidOperandCount (arity is validated before calc is called, so
// seeing it means a bug), becomes a generic 500 that leaks no detail.
func mapError(err error) (int, errorBody) {
	var reqErr *requestError
	switch {
	case errors.As(err, &reqErr):
		return reqErr.status, newErrorBody(reqErr.code, reqErr.message)
	case errors.Is(err, calc.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, newErrorBody("division_by_zero", "cannot divide by zero")
	case errors.Is(err, calc.ErrNegativeSqrt):
		return http.StatusUnprocessableEntity, newErrorBody("negative_sqrt", "cannot take the square root of a negative number")
	case errors.Is(err, calc.ErrNonFiniteResult):
		return http.StatusUnprocessableEntity, newErrorBody("non_finite_result", "result is not a finite number")
	case errors.Is(err, calc.ErrUnknownOperation):
		return http.StatusBadRequest, newErrorBody("unknown_operation", err.Error())
	default:
		return http.StatusInternalServerError, newErrorBody("internal", "internal server error")
	}
}

func newErrorBody(code, message string) errorBody {
	return errorBody{Error: errorDetail{Code: code, Message: message}}
}
