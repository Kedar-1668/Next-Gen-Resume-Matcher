using Microsoft.AspNetCore.Mvc;
using AspNetCore.Reporting;
using System.Data;
using System.Text.Json;

namespace WebApplication1.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class RDLCController : ControllerBase
    {
        [HttpPost("generate")]
        public IActionResult GenerateReport([FromBody] JsonElement request)
        {
            try
            {
                // Check if "data" field exists
                if (!request.TryGetProperty("data", out JsonElement candidates))
                {
                    return BadRequest("No data field found in request");
                }

                if (candidates.GetArrayLength() == 0)
                {
                    return BadRequest("Candidate list is empty");
                }

                System.Text.Encoding.RegisterProvider(
                    System.Text.CodePagesEncodingProvider.Instance
                );

                // RDLC file path
                string reportPath = Path.Combine(
                    Directory.GetCurrentDirectory(),
                    "Reports",
                    "CandidateReport.rdlc"
                );

                Console.WriteLine("RDLC Path: " + reportPath);
                Console.WriteLine("File Exists: " + System.IO.File.Exists(reportPath));

                if (!System.IO.File.Exists(reportPath))
                {
                    return BadRequest("RDLC file not found");
                }

                // Create DataTable matching RDLC dataset
                DataTable dt = new DataTable("CandidateDataSet");

                dt.Columns.Add("Rank");
                dt.Columns.Add("CandidateName");
                dt.Columns.Add("Email");
                dt.Columns.Add("Score");
                dt.Columns.Add("Degree");
                dt.Columns.Add("RoleApplied");

                foreach (var item in candidates.EnumerateArray())
                {
                    int rank = item.TryGetProperty("rank", out JsonElement rankElement)
                        ? rankElement.GetInt32()
                        : 0;

                    double score = item.TryGetProperty("score", out JsonElement scoreElement)
                        ? scoreElement.GetDouble()
                        : 0;

                    string candidateName = "N/A";
                    string email = "N/A";
                    string degree = "N/A";
                    string roleApplied =
    request.TryGetProperty("jobTitle", out JsonElement titleElement)
    ? titleElement.GetString() ?? "N/A"
    : "N/A";

                    Console.WriteLine("ROLE = " + roleApplied);

                    // Resume data
                    if (item.TryGetProperty("resume", out JsonElement resume))
                    {
                        if (resume.TryGetProperty("candidateName", out JsonElement nameElement))
                        {
                            candidateName = nameElement.GetString() ?? "N/A";
                        }

                        if (resume.TryGetProperty("email", out JsonElement emailElement))
                        {
                            email = emailElement.GetString() ?? "N/A";
                        }

                        if (
                            resume.TryGetProperty("education", out JsonElement education)
                            && education.ValueKind == JsonValueKind.Array
                            && education.GetArrayLength() > 0
                        )
                        {
                            var firstEducation = education[0];

                            if (firstEducation.TryGetProperty("degree", out JsonElement degreeElement))
                            {
                                degree = degreeElement.GetString() ?? "N/A";
                            }
                        }
                    }

                    
                    dt.Rows.Add(
                        rank,
                        candidateName,
                        email,
                        score,
                        degree,
                        roleApplied
                    );
                }
                Console.WriteLine("Rows added: " + dt.Rows.Count);

                Environment.SetEnvironmentVariable(
     "FrameworkDir",
     @"C:\Windows\Microsoft.NET\Framework64\"
 );

                Environment.SetEnvironmentVariable(
                    "FrameworkVersion",
                    "v4.0.30319"
                );
                // Generate RDLC report
                LocalReport report = new LocalReport(reportPath);

                report.AddDataSource("CandidateDataSet", dt);

                var result = report.Execute(
                    RenderType.Pdf,
                    1,
                    new Dictionary<string, string>(),
                    ""
                );

                return File(
                    result.MainStream,
                    "application/pdf",
                    "AI_Resume_Report.pdf"
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine("RDLC Error: " + ex.ToString());

                return StatusCode(
                    500,
                    new
                    {
                        message = "Report generation failed",
                        error = ex.Message
                    }
                );
            }
        }
    }
}