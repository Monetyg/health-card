package authz.user

default allow := false

allow if {
  input.subject.auth_type == "anon"
  input.cloudbase.resource_type == "functions"
}
