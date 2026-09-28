package authz.user

default allow := false

# 诊断用：拒绝一切，并在拒绝原因中回显真实 input 字段，
# 以便确认 auth_type / resource_type / path 的实际取值。
deny contains msg if {
  msg := sprintf("DIAG auth_type=[%v] resource_type=[%v] path=[%v] method=[%v]",
    [input.subject.auth_type, input.cloudbase.resource_type, input.request.path, input.request.method])
}
