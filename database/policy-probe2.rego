package authz.user

default allow := false

# 探测：逐个测试候选 auth_type 取值（PG 环境匿名角色可能是 anon / anonymous / authenticated）
allow if {
  input.subject.auth_type == "anon"
  input.cloudbase.resource_type == "functions"
}

allow if {
  input.subject.auth_type == "anonymous"
  input.cloudbase.resource_type == "functions"
}

allow if {
  input.subject.auth_type == "authenticated"
  input.cloudbase.resource_type == "functions"
}

allow if {
  input.subject.auth_type == "external"
  input.cloudbase.resource_type == "functions"
}

allow if {
  input.subject.auth_type == "unauthenticated"
  input.cloudbase.resource_type == "functions"
}
