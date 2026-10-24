using System.Reflection;using System.Reflection.Metadata;using System.Reflection.PortableExecutable;using System.Collections.Immutable;using System.Text.Json;
class Types:ISignatureTypeProvider<string,object>{
 public string Name(MetadataReader r,TypeDefinitionHandle h){var d=r.GetTypeDefinition(h);return d.GetDeclaringType().IsNil?r.GetString(d.Namespace)+"."+r.GetString(d.Name):Name(r,d.GetDeclaringType())+"+"+r.GetString(d.Name);}
 public string GetTypeFromDefinition(MetadataReader r,TypeDefinitionHandle h,byte raw)=>Name(r,h);
 public string GetTypeFromReference(MetadataReader r,TypeReferenceHandle h,byte raw){var d=r.GetTypeReference(h);return d.ResolutionScope.Kind==HandleKind.TypeReference?GetTypeFromReference(r,(TypeReferenceHandle)d.ResolutionScope,raw)+"+"+r.GetString(d.Name):r.GetString(d.Namespace)+"."+r.GetString(d.Name);}
 public string GetTypeFromSpecification(MetadataReader r,object c,TypeSpecificationHandle h,byte raw)=>r.GetTypeSpecification(h).DecodeSignature(this,c);
 public string GetArrayType(string e,ArrayShape s)=>e+"["+s.Rank+":"+string.Join(',',s.Sizes)+":"+string.Join(',',s.LowerBounds)+"]";
 public string GetByReferenceType(string e)=>e+"&";public string GetFunctionPointerType(MethodSignature<string> s)=>"fn:"+Sig(s);public string GetGenericInstantiation(string g,ImmutableArray<string> a)=>g+"<"+string.Join(',',a)+">";
 public string GetGenericMethodParameter(object c,int i)=>"!!"+i;public string GetGenericTypeParameter(object c,int i)=>"!"+i;public string GetModifiedType(string m,string u,bool req)=>(req?"modreq":"modopt")+"("+m+")"+u;public string GetPinnedType(string e)=>e+" pinned";public string GetPointerType(string e)=>e+"*";public string GetPrimitiveType(PrimitiveTypeCode c)=>c.ToString();public string GetSZArrayType(string e)=>e+"[]";
 public static string Sig(MethodSignature<string> s)=>s.Header.RawValue+":"+s.GenericParameterCount+":"+s.ReturnType+"("+string.Join(',',s.ParameterTypes)+")";
}
class Program{
 static bool MethodVisible(MethodAttributes a)=>(a&MethodAttributes.MemberAccessMask) is MethodAttributes.Public or MethodAttributes.Family or MethodAttributes.FamORAssem;
 static bool Visible(MetadataReader r,TypeDefinitionHandle h){var t=r.GetTypeDefinition(h);var v=t.Attributes&TypeAttributes.VisibilityMask;return v==TypeAttributes.Public||(v is TypeAttributes.NestedPublic or TypeAttributes.NestedFamily or TypeAttributes.NestedFamORAssem)&&Visible(r,t.GetDeclaringType());}
 static SortedSet<string> Surface(string path){using var f=File.OpenRead(path);using var pe=new PEReader(f);var r=pe.GetMetadataReader();var p=new Types();var result=new SortedSet<string>();
 foreach(var h in r.TypeDefinitions){if(!Visible(r,h))continue;var t=r.GetTypeDefinition(h);var name=p.Name(r,h);result.Add("T "+name+" "+t.Attributes);
 foreach(var m in t.GetMethods()){var d=r.GetMethodDefinition(m);if(MethodVisible(d.Attributes))result.Add("M "+name+"."+r.GetString(d.Name)+" "+Types.Sig(d.DecodeSignature(p,null))+" "+d.Attributes);}
 foreach(var m in t.GetFields()){var d=r.GetFieldDefinition(m);if((d.Attributes&FieldAttributes.FieldAccessMask) is FieldAttributes.Public or FieldAttributes.Family or FieldAttributes.FamORAssem)result.Add("F "+name+"."+r.GetString(d.Name)+" "+d.DecodeSignature(p,null)+" "+d.Attributes);}}
 return result;}
 static int Main(string[] a){var b=Surface(a[0]);var c=Surface(a[1]);var missing=b.Except(c).ToArray();var added=c.Except(b).ToArray();File.WriteAllText(a[2],JsonSerializer.Serialize(new{baseline=a[0],candidate=a[1],baselineEntries=b.Count,candidateEntries=c.Count,missing,added},new JsonSerializerOptions{WriteIndented=true}));Console.WriteLine($"Baseline {b.Count}, candidate {c.Count}, missing {missing.Length}, added {added.Length}");return missing.Length==0?0:1;}
}
