package validation

import "strings"

type Errors map[string][]string

func (e Errors) Add(field, message string) {
	e[field] = append(e[field], message)
}

func (e Errors) Empty() bool { return len(e) == 0 }

func Required(value string) bool { return strings.TrimSpace(value) != "" }
